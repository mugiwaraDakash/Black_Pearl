import logging
import os
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.database import get_db
from app.models import Case, IOC
from app.schemas import CaseSummaryOut, CaseDetailOut
from app.services.email_parser import parse_eml
from app.services.gemini_service import classify_email
from app.services.geo_service import geolocate_many
from app.services.risk_engine import compute_risk
from app import ledger
from app import neo4j_client

logger = logging.getLogger(__name__)
router = APIRouter()

SAMPLES_DIR = Path(__file__).resolve().parent.parent / "sample_emails"

SAMPLE_CATALOG = [
    {
        "filename": "phishing_sample.eml",
        "title": "Urgent Invoice Overdue",
        "category": "phishing",
        "threat_type": "Credential Harvesting Phishing",
        "description": "Fails SPF/DKIM/DMARC, reply-to mismatch, high-urgency language and fake verification link.",
        "badge_color": "red",
    },
    {
        "filename": "bec_sample.eml",
        "title": "Project Falcon Wire Transfer",
        "category": "bec",
        "threat_type": "Business Email Compromise (BEC)",
        "description": "Passes SPF/DKIM but contains social engineering: banking change, $247k wire diversion, avoid phone calls.",
        "badge_color": "purple",
    },
    {
        "filename": "legitimate_sample.eml",
        "title": "Jira Sprint 23 Retrospective",
        "category": "legitimate",
        "threat_type": "Legitimate Notification",
        "description": "Authentic Atlassian Jira automated update with fully valid DKIM/SPF and benign project content.",
        "badge_color": "green",
    },
]


def _process_email_bytes(raw_bytes: bytes, filename: str, db: Session) -> CaseDetailOut:
    try:
        parsed = parse_eml(raw_bytes)
    except Exception as e:
        logger.exception("Failed to parse .eml")
        raise HTTPException(400, f"Could not parse email file: {e}")

    ai_result = classify_email(
        subject=parsed["subject"],
        sender=parsed["from_addr"],
        body_text=parsed["body_text"],
        auth_context={
            "spf": parsed["spf"], "dkim": parsed["dkim"], "dmarc": parsed["dmarc"],
            "auth_anomalies": parsed["auth_anomalies"],
        },
    )

    geo_results = geolocate_many(parsed["iocs"]["ips"])

    risk = compute_risk(
        spf=parsed["spf"], dkim=parsed["dkim"], dmarc=parsed["dmarc"],
        anomalies=parsed["auth_anomalies"],
        ai_verdict=ai_result["verdict"], ai_confidence=ai_result["confidence"],
        geo_results=geo_results,
    )

    case = Case(
        filename=filename,
        subject=parsed["subject"],
        sender=parsed["from_addr"],
        sender_domain=parsed["sender_domain"],
        to_addr=parsed["to_addr"],
        raw_headers="\n".join(f"{k}: {v}" for k, v in parsed["headers"].items()),
        body_text=parsed["body_text"],
        spf_result=parsed["spf"],
        dkim_result=parsed["dkim"],
        dmarc_result=parsed["dmarc"],
        relay_path=parsed["relay_path"],
        auth_anomalies=parsed["auth_anomalies"],
        ai_verdict=ai_result["verdict"],
        ai_confidence=ai_result["confidence"],
        ai_reasoning=ai_result["reasoning"],
        ai_indicators=ai_result.get("indicators", []),
        risk_score=risk["risk_score"],
        risk_level=risk["risk_level"],
        risk_breakdown=risk["risk_breakdown"],
    )
    db.add(case)
    db.flush()  # get case.id before commit

    geo_by_ip = {g["ip"]: g for g in geo_results if "ip" in g}
    for ip in parsed["iocs"]["ips"]:
        g = geo_by_ip.get(ip, {})
        db.add(IOC(
            case_id=case.id, ioc_type="ip", value=ip,
            country=g.get("country"), region=g.get("region"), city=g.get("city"),
            lat=g.get("lat"), lon=g.get("lon"), isp=g.get("isp"), org=g.get("org"),
            is_proxy=str(g.get("is_proxy", False)),
        ))
    for domain in parsed["iocs"]["domains"]:
        db.add(IOC(case_id=case.id, ioc_type="domain", value=domain))
    for url in parsed["iocs"]["urls"]:
        db.add(IOC(case_id=case.id, ioc_type="url", value=url))

    # evidence ledger — append-only hash chain
    ledger_entry = ledger.append_event(
        case_id=case.id,
        event_type="case_created",
        payload={
            "filename": filename,
            "subject": parsed["subject"],
            "sender": parsed["from_addr"],
            "spf": parsed["spf"], "dkim": parsed["dkim"], "dmarc": parsed["dmarc"],
            "ai_verdict": ai_result["verdict"], "ai_confidence": ai_result["confidence"],
            "risk_score": risk["risk_score"],
            "iocs": parsed["iocs"],
        },
    )
    case.evidence_hash = ledger_entry["record_hash"]
    case.ledger_seq = ledger_entry["seq"]

    db.commit()
    db.refresh(case)

    # graph correlation — best-effort, don't fail the whole request if Neo4j is down
    try:
        neo4j_client.upsert_case_graph(
            case_id=case.id, subject=parsed["subject"], sender_domain=parsed["sender_domain"],
            risk_score=risk["risk_score"], verdict=ai_result["verdict"],
            ips=parsed["iocs"]["ips"], domains=parsed["iocs"]["domains"], urls=parsed["iocs"]["urls"],
        )
    except Exception as e:
        logger.warning("Neo4j graph upsert failed (is Neo4j running?): %s", e)

    return _case_to_detail(case)


@router.post("/analyze", response_model=CaseDetailOut)
async def analyze_email(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not file.filename.endswith((".eml", ".txt")):
        raise HTTPException(400, "Upload a .eml file (raw RFC 822 email, headers included).")

    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(400, "Empty file.")

    return _process_email_bytes(raw_bytes, file.filename, db)


@router.get("/samples")
def list_sample_emails():
    """Returns available pre-packaged sample emails with descriptions for quick testing."""
    return SAMPLE_CATALOG


@router.post("/samples/{filename}/analyze", response_model=CaseDetailOut)
def analyze_sample_email(filename: str, db: Session = Depends(get_db)):
    """Triggers end-to-end analysis on one of the pre-packaged sample emails directly."""
    sample_path = SAMPLES_DIR / filename
    if not sample_path.is_file():
        raise HTTPException(404, f"Sample email '{filename}' not found.")

    raw_bytes = sample_path.read_bytes()
    return _process_email_bytes(raw_bytes, filename, db)


@router.get("/cases", response_model=list[CaseSummaryOut])
def list_cases(db: Session = Depends(get_db)):
    cases = db.query(Case).order_by(desc(Case.created_at)).all()
    return [
        CaseSummaryOut(
            id=c.id, created_at=c.created_at.isoformat(), filename=c.filename,
            subject=c.subject, sender=c.sender, risk_score=c.risk_score,
            risk_level=c.risk_level, ai_verdict=c.ai_verdict,
        )
        for c in cases
    ]


@router.get("/cases/{case_id}", response_model=CaseDetailOut)
def get_case(case_id: str, db: Session = Depends(get_db)):
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(404, "Case not found")
    return _case_to_detail(case)


@router.get("/cases/{case_id}/graph")
def get_case_graph(case_id: str, db: Session = Depends(get_db)):
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(404, "Case not found")
    try:
        result = neo4j_client.get_case_subgraph(case_id)
        if result is not None:
            return result
    except Exception as e:
        logger.warning("Neo4j graph unavailable, falling back to IOC-based graph: %s", e)

    # Fallback: build a simple graph from the SQLite IOC data (no Neo4j needed)
    iocs = db.query(IOC).filter(IOC.case_id == case_id).all()
    email_node_id = f"email:{case_id}"
    nodes = [{
        "id": email_node_id,
        "label": (case.subject or "email")[:40],
        "type": "Email",
    }]
    edges = []
    TYPE_REL = {"ip": "ORIGINATED_FROM", "domain": "REFERENCES_DOMAIN", "url": "CONTAINS_URL"}
    for ioc in iocs:
        node_id = f"{ioc.ioc_type}:{ioc.value}"
        node_type = ioc.ioc_type.capitalize()
        nodes.append({"id": node_id, "label": ioc.value, "type": node_type})
        edges.append({"source": email_node_id, "target": node_id, "type": TYPE_REL.get(ioc.ioc_type, "LINKED_TO")})
    return {"nodes": nodes, "edges": edges}


@router.get("/cases/{case_id}/related")
def get_related_cases(case_id: str, db: Session = Depends(get_db)):
    try:
        return neo4j_client.find_related_cases(case_id)
    except Exception as e:
        logger.warning("Neo4j unavailable for related cases query: %s", e)
        return []


@router.get("/cases/{case_id}/evidence-trail")
def get_evidence_trail(case_id: str):
    return ledger.get_case_trail(case_id)


@router.get("/ledger/verify")
def verify_ledger():
    """Proves the evidence ledger hasn't been tampered with — walks the whole
    hash chain and recomputes every hash."""
    return ledger.verify_chain()


def _case_to_detail(case: Case) -> CaseDetailOut:
    return CaseDetailOut(
        id=case.id, created_at=case.created_at.isoformat(), filename=case.filename,
        subject=case.subject, sender=case.sender, sender_domain=case.sender_domain,
        to_addr=case.to_addr,
        spf_result=case.spf_result, dkim_result=case.dkim_result, dmarc_result=case.dmarc_result,
        relay_path=case.relay_path, auth_anomalies=case.auth_anomalies,
        ai_verdict=case.ai_verdict, ai_confidence=case.ai_confidence,
        ai_reasoning=case.ai_reasoning, ai_indicators=case.ai_indicators,
        risk_score=case.risk_score, risk_level=case.risk_level, risk_breakdown=case.risk_breakdown,
        evidence_hash=case.evidence_hash, ledger_seq=case.ledger_seq,
        iocs=[
            {
                "ioc_type": i.ioc_type, "value": i.value, "country": i.country,
                "region": i.region, "city": i.city, "lat": i.lat, "lon": i.lon,
                "isp": i.isp, "org": i.org, "is_proxy": i.is_proxy == "True",
            }
            for i in case.iocs
        ],
    )
