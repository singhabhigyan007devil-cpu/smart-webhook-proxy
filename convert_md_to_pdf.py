from pathlib import Path
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Preformatted
from reportlab.lib.enums import TA_LEFT, TA_JUSTIFY
from reportlab.lib import colors
import re

src = Path("HookShield_Deployment_Guide.md")
out = Path("HookShield_Deployment_Guide.pdf")
text = src.read_text(encoding="utf-8")

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="CustomTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=18, leading=22, alignment=TA_LEFT, spaceAfter=10))
styles.add(ParagraphStyle(name="CustomHeading1", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=14, leading=18, spaceBefore=10, spaceAfter=6))
styles.add(ParagraphStyle(name="CustomHeading2", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=12, leading=16, spaceBefore=8, spaceAfter=4))
styles.add(ParagraphStyle(name="CustomHeading3", parent=styles["Heading3"], fontName="Helvetica-Bold", fontSize=11, leading=14, spaceBefore=6, spaceAfter=3))
styles.add(ParagraphStyle(name="CustomBody", parent=styles["BodyText"], fontSize=10, leading=14, alignment=TA_JUSTIFY, spaceAfter=6))
styles.add(ParagraphStyle(name="CustomCode", parent=styles["Code"], fontName="Courier", fontSize=8, leading=10, backColor=colors.whitesmoke, borderPadding=6, spaceAfter=8))
styles.add(ParagraphStyle(name="CustomBullet", parent=styles["BodyText"], fontSize=10, leading=14, leftIndent=18, spaceAfter=4))

flowables = []
lines = text.splitlines()
in_code = False
code = []
para = []


def flush_para():
    global para
    if para:
        flowables.append(Paragraph(" ".join(para).strip(), styles["CustomBody"]))
        para = []

for line in lines:
    if line.startswith("```"):
        if in_code:
            flush_para()
            flowables.append(Preformatted("\n".join(code), styles["CustomCode"]))
            code=[]
            in_code=False
        else:
            flush_para()
            in_code=True
        continue
    if in_code:
        code.append(line)
        continue
    if not line.strip():
        flush_para()
        flowables.append(Spacer(1, 6))
        continue
    m = re.match(r"^(#{1,6})\s+(.*)$", line)
    if m:
        flush_para()
        level = len(m.group(1))
        title = m.group(2).strip()
        if level == 1:
            flowables.append(Paragraph(title, styles["CustomHeading1"]))
        elif level == 2:
            flowables.append(Paragraph(title, styles["CustomHeading2"]))
        else:
            flowables.append(Paragraph(title, styles["CustomHeading3"]))
    elif re.match(r"^[-*]\s+", line):
        flush_para()
        flowables.append(Paragraph(line[2:].strip(), styles["CustomBullet"]))
    elif re.match(r"^\d+\.\s+", line):
        flush_para()
        flowables.append(Paragraph(line.strip(), styles["CustomBody"]))
    else:
        para.append(line.strip())

flush_para()
if in_code:
    flowables.append(Preformatted("\n".join(code), styles["CustomCode"]))

doc = SimpleDocTemplate(str(out), pagesize=letter, rightMargin=54, leftMargin=54, topMargin=54, bottomMargin=54)
doc.build(flowables)
print("Created", out.resolve())
