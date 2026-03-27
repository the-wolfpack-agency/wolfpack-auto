#!/usr/bin/env python3
"""Generate the Wolfpack Analytics & SEO Intelligence Platform PDF report."""

from fpdf import FPDF


class WolfpackPDF(FPDF):
    DARK = (15, 23, 42)
    ACCENT = (59, 130, 246)
    LIGHT_BG = (241, 245, 249)
    WHITE = (255, 255, 255)
    TEXT = (30, 41, 59)
    SUBTLE = (100, 116, 139)
    GREEN = (34, 197, 94)
    RED = (239, 68, 68)
    AMBER = (245, 158, 11)

    def header(self):
        if self.page_no() == 1:
            return
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(*self.SUBTLE)
        self.cell(0, 8, "Wolfpack Auto - Analytics & SEO Intelligence Platform", align="C")
        self.ln(12)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(*self.SUBTLE)
        self.cell(0, 10, f"Page {self.page_no()}/{{nb}}", align="C")

    def section_title(self, title):
        self.set_font("Helvetica", "B", 16)
        self.set_text_color(*self.DARK)
        self.cell(0, 12, title)
        self.ln(4)
        self.set_draw_color(*self.ACCENT)
        self.set_line_width(0.8)
        self.line(self.l_margin, self.get_y(), self.l_margin + 50, self.get_y())
        self.ln(8)

    def sub_title(self, title):
        self.set_font("Helvetica", "B", 13)
        self.set_text_color(*self.DARK)
        self.cell(0, 10, title)
        self.ln(8)

    def body_text(self, text):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(*self.TEXT)
        self.multi_cell(0, 5.5, text)
        self.ln(3)

    def accent_text(self, text):
        self.set_font("Helvetica", "I", 10)
        self.set_text_color(*self.ACCENT)
        self.multi_cell(0, 5.5, text)
        self.set_text_color(*self.TEXT)
        self.ln(3)

    def highlight_box(self, text):
        self.set_fill_color(*self.LIGHT_BG)
        self.set_font("Helvetica", "", 10)
        self.set_text_color(*self.TEXT)
        x, y = self.get_x(), self.get_y()
        self.set_draw_color(*self.ACCENT)
        self.set_line_width(0.4)
        self.rect(x, y, self.w - self.l_margin - self.r_margin, 18, "DF")
        self.set_xy(x + 4, y + 2)
        self.multi_cell(self.w - self.l_margin - self.r_margin - 8, 5, text)
        self.set_xy(x, y + 20)

    def table_row(self, col1, col2, bold=False, header=False):
        w1 = 70
        w2 = self.w - self.l_margin - self.r_margin - w1
        if header:
            self.set_fill_color(*self.DARK)
            self.set_text_color(*self.WHITE)
            self.set_font("Helvetica", "B", 10)
        elif bold:
            self.set_fill_color(*self.LIGHT_BG)
            self.set_text_color(*self.TEXT)
            self.set_font("Helvetica", "B", 10)
        else:
            self.set_fill_color(*self.WHITE)
            self.set_text_color(*self.TEXT)
            self.set_font("Helvetica", "", 10)
        self.cell(w1, 7, f"  {col1}", border=0, fill=True)
        self.cell(w2, 7, f"  {col2}", border=0, fill=True)
        self.ln()

    def scanner_row(self, cwe, description):
        w1 = 35
        w2 = self.w - self.l_margin - self.r_margin - w1
        self.set_font("Helvetica", "B", 9)
        self.set_text_color(*self.ACCENT)
        self.cell(w1, 6, f"  {cwe}", border=0)
        self.set_font("Helvetica", "", 9)
        self.set_text_color(*self.TEXT)
        self.cell(w2, 6, description, border=0)
        self.ln()


def build_pdf():
    pdf = WolfpackPDF()
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.set_margins(20, 15, 20)

    # ── Cover page ──────────────────────────────────────────────
    pdf.add_page()
    pdf.set_fill_color(*WolfpackPDF.DARK)
    pdf.rect(0, 0, 210, 297, "F")

    pdf.set_y(80)
    pdf.set_font("Helvetica", "B", 32)
    pdf.set_text_color(*WolfpackPDF.WHITE)
    pdf.cell(0, 14, "Wolfpack Auto", align="C")
    pdf.ln(16)

    pdf.set_font("Helvetica", "", 16)
    pdf.set_text_color(*WolfpackPDF.ACCENT)
    pdf.cell(0, 10, "Analytics & SEO Intelligence Platform", align="C")
    pdf.ln(30)

    pdf.set_font("Helvetica", "", 12)
    pdf.set_text_color(148, 163, 184)
    pdf.cell(0, 8, "Prepared for Nick Hoxsie, CEO", align="C")
    pdf.ln(8)
    pdf.cell(0, 8, "March 26, 2026", align="C")
    pdf.ln(40)

    # Stats bar
    stats = [("31", "Signals"), ("28", "Insight\nGenerators"), ("189", "Automated\nTests"), ("18", "CWE\nClasses")]
    box_w = 35
    gap = 8
    total_w = len(stats) * box_w + (len(stats) - 1) * gap
    start_x = (210 - total_w) / 2
    y = pdf.get_y()

    for i, (num, label) in enumerate(stats):
        x = start_x + i * (box_w + gap)
        pdf.set_fill_color(30, 41, 59)
        pdf.set_draw_color(*WolfpackPDF.ACCENT)
        pdf.set_line_width(0.3)
        pdf.rect(x, y, box_w, 30, "DF")
        pdf.set_xy(x, y + 4)
        pdf.set_font("Helvetica", "B", 20)
        pdf.set_text_color(*WolfpackPDF.ACCENT)
        pdf.cell(box_w, 10, num, align="C")
        pdf.set_xy(x, y + 16)
        pdf.set_font("Helvetica", "", 8)
        pdf.set_text_color(148, 163, 184)
        pdf.multi_cell(box_w, 4, label, align="C")

    # ── Page 2: What This Is ────────────────────────────────────
    pdf.add_page()
    pdf.section_title("What This Is")
    pdf.body_text(
        "Every page on Wolfpack Auto runs a behavioral intelligence engine that captures "
        "31 distinct user signals, composes them into 28 insight generators, and produces "
        "answers no other tool on the market can give. No cookies. No third-party scripts. "
        "No user opt-in required."
    )
    pdf.body_text(
        "This is not Google Analytics. This is not Hotjar. This is not a dashboard that "
        "tells you what happened. This is a brain that tells you what to do next -- and "
        "it gets smarter with every visitor."
    )
    pdf.ln(4)
    pdf.highlight_box(
        "No competitor can replicate this because no competitor owns all the pieces: "
        "search data, inventory data, behavioral data, chat data, and page performance data -- "
        "all cross-referenced in real time."
    )

    # ── Page 3-5: The Six New Capabilities ──────────────────────
    pdf.ln(6)
    pdf.section_title("The Six New Capabilities")

    # 1. Lead Temperature
    pdf.sub_title("1. Lead Temperature Score")
    pdf.body_text(
        "Every session gets a real-time score from 0 to 100 -- cold, cool, warm, or hot. "
        "This is a weighted composite of 10 signal categories: vehicles viewed, chat "
        "specificity, pricing interactions, return visit frequency, search behavior, time "
        "investment, form engagement, comparison shopping intensity, and whether the buyer "
        "is narrowing their search over multiple visits."
    )
    pdf.accent_text(
        "A score of 85 means: \"This person has visited 5 times in 10 days, narrowed from "
        "SUVs to specifically the RAV4, used the financing calculator, copied a VIN, and "
        "asked about test drives in the chat.\" That person is ready to buy."
    )
    pdf.body_text(
        "The chat widget adjusts its behavior based on this score. A cold browser gets "
        "\"How can I help?\" A hot lead gets \"I see you're looking at the RAV4 -- want to "
        "schedule a test drive this afternoon?\""
    )

    # 2. Inventory Gap Detection
    pdf.sub_title("2. Inventory Gap Detection")
    pdf.body_text(
        "The system cross-references what users search for against what is actually in "
        "inventory. When 14 people search for \"electric SUV under 40K\" and you have zero "
        "matching vehicles, the brain flags it: \"You are missing this. These people wanted "
        "to buy something you don't have.\""
    )
    pdf.body_text(
        "Zero-result searches are flagged separately as the strongest gap signal. These are "
        "customers who showed up with money and left with nothing. This is market "
        "intelligence that used to require focus groups and surveys. Now it comes from the "
        "search bar on your own website -- free, in real time, at scale."
    )

    # 3. Photo Engagement Score
    pdf.add_page()
    pdf.sub_title("3. Photo Engagement Score")
    pdf.body_text(
        "Every vehicle listing gets a score from 0 to 100, computed from how users "
        "interact with that listing: dwell time, pinch-to-zoom on images, device rotation, "
        "whether users copy the VIN or price, and how far they scroll."
    )
    pdf.accent_text(
        "A listing with 40 views and a score of 18: \"People look but don't engage. The "
        "photos are bad, the price is wrong, or the description doesn't sell it.\"\n"
        "A listing with 10 views and a score of 85: \"Everyone who sees this car gets hooked.\""
    )
    pdf.body_text(
        "Dealers spend $30,000-$50,000/year on photography. This score tells them exactly "
        "which listings need re-shooting."
    )

    # 4. Cross-Session Buyer Lifecycle
    pdf.sub_title("4. Cross-Session Buyer Lifecycle")
    pdf.body_text(
        "Most analytics tools treat each visit as independent. A user who visits five times "
        "over two weeks looks like five separate strangers. We track buyer journeys across "
        "multiple visits using a privacy-safe fingerprint that survives Safari's cookie "
        "restrictions (which kill Google Analytics tracking)."
    )
    pdf.body_text(
        "The system classifies each user into a lifecycle stage -- awareness, consideration, "
        "evaluation, or decision -- based on visit frequency, vehicle narrowing patterns, "
        "and engagement deepening."
    )
    pdf.accent_text(
        "\"This user started browsing trucks two weeks ago. Over four visits they narrowed "
        "to F-150s, then to a specific trim. Last visit they used the financing calculator "
        "and asked about trade-in value. They're in the decision stage.\""
    )

    # 5. Page Speed -> Revenue
    pdf.sub_title("5. Page Speed to Revenue Correlation")
    pdf.body_text(
        "We measure actual page load performance using the browser's Navigation Timing API "
        "-- load time, time to first byte, largest contentful paint, first input delay -- "
        "and correlate it directly with conversion rate."
    )
    pdf.accent_text(
        "\"Users on pages loading under 1 second convert at 8.4%. Users on pages over 3 "
        "seconds convert at 1.2%. Every second of load time costs you $X per month.\""
    )
    pdf.body_text(
        "This turns a technical metric into a revenue metric. When you tell a dealer "
        "their inventory page is slow and it costs them $4,000/month in lost leads, "
        "they listen."
    )

    # 6. CTA Visibility Gap
    pdf.sub_title("6. CTA Visibility Gap")
    pdf.body_text(
        "We track where every call-to-action sits on the page and cross-reference it "
        "with how far users actually scroll."
    )
    pdf.accent_text(
        "\"Your 'Schedule Test Drive' button is at 78% scroll depth. Only 31% of users "
        "scroll past 50%. That button is invisible to 69% of your visitors.\""
    )
    pdf.body_text(
        "The fix takes 5 minutes. The impact is immediate."
    )

    # ── Cross-Reference Intelligence ────────────────────────────
    pdf.add_page()
    pdf.section_title("Cross-Reference Intelligence")
    pdf.body_text(
        "The real power is not in individual signals. It is in what happens when you "
        "cross-reference them."
    )
    pdf.ln(2)

    cross_refs = [
        ("Hot Lead Exit Detection",
         "When a user with a temperature of 75+ shows exit intent, the system flags it: "
         "\"A warm lead is about to leave from the contact page.\" This is the exact moment "
         "to trigger a chat prompt, a retention offer, or a callback widget."),
        ("Frustrated Buyer Detection",
         "When a high-temperature user rage-clicks on a UI element, the system escalates: "
         "\"Someone trying to buy from you is blocked by a broken button on the contact form. "
         "Fix this immediately -- it is costing you revenue right now.\""),
        ("Network Quality x Conversion",
         "Users on slow mobile connections convert at different rates. If 3G users convert "
         "60% less than 4G users, the system tells you to optimize images and page weight "
         "for mobile visitors."),
    ]
    for title, desc in cross_refs:
        pdf.sub_title(title)
        pdf.body_text(desc)

    # ── Existing Capabilities ───────────────────────────────────
    pdf.section_title("What We Already Capture")

    categories = [
        ("How Users Feel", [
            "Rage clicks -- rapid clicking reveals frustration with specific elements",
            "Dead clicks -- clicking non-interactive elements reveals design gaps",
            "Form abandonment -- exact field where users quit filling out forms",
            "Micro-hesitation -- typing and deleting in form fields shows confusion",
        ]),
        ("What Users Want", [
            "Search queries -- every search ranked and categorized",
            "Copy-paste behavior -- VIN copying = researching, price copying = comparing",
            "Price trajectory -- are they browsing up (upgrading) or down (budget-seeking)?",
            "Calculator inputs -- financing ranges reveal budget without asking",
        ]),
        ("Who Is Ready to Buy", [
            "Session momentum -- accelerating engagement predicts conversion",
            "Exit intent -- detect when users move to leave before they go",
            "Chat sentiment trajectory -- rising specificity = approaching purchase",
            "Time-to-first-interaction -- classify intent vs. browsing in 2 seconds",
        ]),
        ("Which Marketing Works", [
            "Referrer correlation -- behavior by traffic source, not just volume",
            "Return visit attribution -- which pages stick in users' minds",
            "Tab switching -- comparison shopping detection and conversion impact",
        ]),
        ("What Gets Read", [
            "Viewport attention mapping -- time each section is actually visible",
            "Scroll velocity -- reading vs. scanning classification",
            "Social proof dwell -- how long users spend on testimonials",
        ]),
    ]

    for cat_title, items in categories:
        pdf.set_font("Helvetica", "B", 11)
        pdf.set_text_color(*WolfpackPDF.ACCENT)
        pdf.multi_cell(0, 8, cat_title)
        for item in items:
            pdf.set_font("Helvetica", "", 9)
            pdf.set_text_color(*WolfpackPDF.TEXT)
            pdf.multi_cell(0, 5, f"  - {item}")
        pdf.ln(3)

    # ── Scanner ─────────────────────────────────────────────────
    pdf.add_page()
    pdf.section_title("The Security Scanner")
    pdf.body_text(
        "Every dealer page is protected by the same security scanner that runs across "
        "the entire platform. Zero-token architecture means scanning is done by pattern "
        "matching -- infinite scale at zero cost per scan."
    )
    pdf.ln(4)

    scanner_items = [
        ("CWE-20", "Input validation -- unbounded allocations, missing size checks"),
        ("CWE-22", "Path traversal -- directory escape in file operations"),
        ("CWE-78", "OS command injection -- unsanitized shell commands"),
        ("CWE-79", "Cross-site scripting (XSS) -- reflected and stored"),
        ("CWE-89", "SQL injection -- unsanitized database queries"),
        ("CWE-200", "Information exposure -- sensitive data in responses"),
        ("CWE-327", "Weak cryptography -- MD5, SHA1 in security contexts"),
        ("CWE-362", "Race conditions -- TOCTOU, unprotected shared state"),
        ("CWE-415", "Double-free -- memory corruption in native code"),
        ("CWE-502", "Insecure deserialization -- untrusted object loading"),
        ("CWE-611", "XML external entities (XXE) -- parser misconfiguration"),
        ("CWE-789", "Unbounded memory allocation -- denial of service vectors"),
        ("CWE-798", "Hardcoded credentials -- secrets in source code"),
        ("CWE-918", "Server-side request forgery (SSRF) -- internal network access"),
        ("CWE-1004", "Missing cookie flags -- security misconfigurations"),
        ("CWE-1021", "Clickjacking -- missing frame protections"),
        ("CWE-1275", "Sensitive cookies without Secure flag"),
        ("RLS", "Row-Level Security -- multi-tenant data isolation"),
        ("Headers", "Security headers -- CSP, HSTS, X-Frame-Options"),
        ("Route Guard", "Unregistered pages missing test coverage"),
    ]

    pdf.set_fill_color(*WolfpackPDF.DARK)
    pdf.set_text_color(*WolfpackPDF.WHITE)
    pdf.set_font("Helvetica", "B", 9)
    pdf.cell(35, 7, "  Class", fill=True)
    pdf.cell(0, 7, "  Coverage", fill=True)
    pdf.ln()

    for i, (cwe, desc) in enumerate(scanner_items):
        if i % 2 == 0:
            pdf.set_fill_color(*WolfpackPDF.LIGHT_BG)
        else:
            pdf.set_fill_color(*WolfpackPDF.WHITE)
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_text_color(*WolfpackPDF.ACCENT)
        pdf.cell(35, 6, f"  {cwe}", fill=True)
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(*WolfpackPDF.TEXT)
        pdf.cell(0, 6, f"  {desc}", fill=True)
        pdf.ln()

    # ── The Moat ────────────────────────────────────────────────
    pdf.ln(6)
    pdf.section_title("Why This Is a Moat")
    pdf.body_text(
        "Every dealer on this platform shares the same technology. One improvement "
        "benefits all of them simultaneously. One security fix protects all of them "
        "instantly."
    )
    pdf.body_text(
        "No dealer needs to worry about their site being different, outdated, or less "
        "secure than another. They are all the same structure, the same analysis, "
        "the same security, the same brain."
    )
    pdf.body_text(
        "The data pipeline is tested end-to-end: events are ingested, insight generation "
        "is verified, vector storage is confirmed, and retrieval is validated. 189 "
        "automated tests verify that data lands where it should, insights are produced "
        "from real signals, and the brain can answer questions about what it has learned."
    )
    pdf.ln(3)
    pdf.highlight_box(
        "This is not a website with analytics bolted on. This is an intelligence "
        "platform that happens to have a website in front of it."
    )

    # ── Summary Table ───────────────────────────────────────────
    pdf.add_page()
    pdf.section_title("Technical Summary")
    pdf.ln(2)

    rows = [
        ("Signal types captured", "31"),
        ("Insight generators", "28"),
        ("Cross-reference insights", "3"),
        ("Automated tests", "189"),
        ("External API calls", "0 (zero-token)"),
        ("Cookies required", "0"),
        ("Third-party dependencies", "0"),
        ("CWE vulnerability classes", "18"),
        ("Security scan patterns", "79"),
        ("Pages covered", "All (uniform architecture)"),
        ("Data stores", "Memory + Qdrant vectors + Neo4j graph"),
        ("Dealer infrastructure", "Shared (one update = all dealers)"),
    ]

    pdf.table_row("Metric", "Value", header=True)
    for i, (k, v) in enumerate(rows):
        pdf.table_row(k, v, bold=(i % 2 == 0))

    pdf.ln(12)
    pdf.set_font("Helvetica", "I", 9)
    pdf.set_text_color(*WolfpackPDF.SUBTLE)
    pdf.multi_cell(0, 5,
        "Built by the Wolfpack engineering team. All analytics are privacy-first, "
        "GDPR-friendly, and require no user consent banners. All data pipelines are "
        "tested end-to-end with automated verification."
    )

    # ── Save ────────────────────────────────────────────────────
    out = "Wolfpack_Analytics_Intelligence_Platform.pdf"
    pdf.output(out)
    print(f"PDF generated: {out}")


if __name__ == "__main__":
    build_pdf()
