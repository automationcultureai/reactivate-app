import csv, random

first_names = ["James","Sarah","Michael","Emma","David","Olivia","Daniel","Sophie",
               "Matthew","Chloe","Chris","Jessica","Tom","Rachel","Ben","Laura",
               "Jake","Hannah","Luke","Amy","Ryan","Megan","Josh","Natalie","Sam",
               "Alex","Brooke","Nathan","Zoe","Tyler"]
last_names  = ["Smith","Johnson","Williams","Brown","Jones","Davis","Wilson","Moore",
               "Taylor","Anderson","Thomas","Jackson","White","Harris","Martin","Thompson",
               "Garcia","Martinez","Robinson","Clark","Lewis","Lee","Walker","Hall"]
services    = ["carpet cleaning","window cleaning","gutter cleaning","pressure washing",
               "end of lease clean","office clean","oven clean","upholstery clean",
               "tile and grout clean","commercial cleaning"]
values      = ["$180","$220","$350","$95","$460","$120","$280","$195","$410","$310","$540","$160"]

# ── CHANGE THIS ──────────────────────────────────────────────
YOUR_EMAIL_PREFIX = "lanetoobag"  # your Gmail address before the @, e.g. "john.smith"
# ─────────────────────────────────────────────────────────────

random.seed(42)
rows = []
for i in range(1, 101):
    first = random.choice(first_names)
    last  = random.choice(last_names)
    year  = random.randint(2021, 2023)
    month = random.randint(1, 12)
    day   = random.randint(1, 28)
    rows.append({
        "name":              f"{first} {last}",
        "email":             f"{YOUR_EMAIL_PREFIX}+lead{i:04d}@gmail.com",
        "last_contact_date": f"{year}-{month:02d}-{day:02d}",
        "service_type":      random.choice(services),
        "purchase_value":    random.choice(values),
    })

out = "test_leads.csv"
with open(out, "w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=["name","email","last_contact_date","service_type","purchase_value"])
    writer.writeheader()
    writer.writerows(rows)

print(f"Written {len(rows)} leads to {out}")
print(f"Emails will arrive at: {YOUR_EMAIL_PREFIX}+lead0001@gmail.com … +lead0100@gmail.com")
