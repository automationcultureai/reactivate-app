import { Zap } from 'lucide-react'

export default function PrivacyPage() {
  const agencyName = process.env.AGENCY_NAME || 'Automation Culture'
  const agencyAddress = process.env.AGENCY_ADDRESS || 'Melbourne, Victoria, Australia'

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-6 py-16 space-y-10">
        {/* Brand */}
        <div className="flex items-center gap-2 text-muted-foreground/50">
          <Zap className="w-4 h-4" />
          <span className="text-sm font-medium">Automation Culture</span>
        </div>

        {/* Title */}
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold text-foreground">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground">
            Last updated:{' '}
            {new Date().toLocaleDateString('en-AU', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        </div>

        <div className="space-y-8 text-foreground">

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">1. Who we are</h2>
            <p className="text-muted-foreground leading-relaxed">
              {agencyName} (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) is based at{' '}
              {agencyAddress}. We operate a reactivation campaign platform (&ldquo;the
              Service&rdquo;) that sends personalised email and SMS messages on behalf of small
              business clients to their past customers.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              This Privacy Policy explains how we collect, hold, use and disclose personal
              information in accordance with the{' '}
              <em>Privacy Act 1988</em> (Cth) and the Australian Privacy Principles (APPs). We act
              as a service provider to our business clients, who remain responsible for the personal
              information of their customers.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">2. What personal information we collect</h2>
            <p className="text-muted-foreground leading-relaxed">
              When our clients upload contact lists, we collect and process the following personal
              information about their past customers (&ldquo;leads&rdquo;):
            </p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Full name</li>
              <li>Email address</li>
              <li>Mobile phone number (where applicable)</li>
              <li>Appointment history and booking status</li>
              <li>Email engagement data (opens, link clicks)</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed">
              This information is provided by our business clients and relates only to individuals
              who have a pre-existing relationship with those businesses.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">3. How we collect personal information</h2>
            <p className="text-muted-foreground leading-relaxed">
              We collect personal information indirectly — it is provided to us by our business
              clients who upload their existing customer records. We do not collect personal
              information directly from individuals except when they voluntarily submit their name
              and email address to book an appointment through our booking page.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">4. Why we send you messages</h2>
            <p className="text-muted-foreground leading-relaxed">
              Emails and SMS messages sent through our platform are sent by or on behalf of
              businesses with whom you have an existing customer relationship. Under the{' '}
              <em>Spam Act 2003</em> (Cth), such messages may be sent on the basis of an inferred
              consent arising from that prior relationship, provided the messages relate to goods or
              services of the same kind you previously purchased.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Every message includes an unsubscribe mechanism. You can opt out at any time and your
              opt-out will be honoured immediately and permanently.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">5. How we use personal information</h2>
            <p className="text-muted-foreground leading-relaxed">We use personal information to:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>
                Send personalised reactivation emails and SMS messages on behalf of the business
              </li>
              <li>Process appointment bookings through our booking system</li>
              <li>Track email engagement to improve message relevance</li>
              <li>Enable businesses to record completed appointments and calculate commission</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed">
              We do not sell, rent, share, or disclose personal information to any third party for
              their own marketing purposes.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">6. Disclosure of personal information</h2>
            <p className="text-muted-foreground leading-relaxed">
              Personal information is disclosed only to:
            </p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>
                The business client on whose behalf the campaign is run (they can see lead names and
                booking status, not email/phone)
              </li>
              <li>
                Our technology sub-processors (cloud hosting, email delivery, SMS delivery) — all
                bound by confidentiality obligations
              </li>
            </ul>
            <p className="text-muted-foreground leading-relaxed">
              We do not disclose personal information to overseas recipients unless adequate
              protections are in place consistent with the APPs.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">7. Data retention</h2>
            <p className="text-muted-foreground leading-relaxed">
              Personal information (name, email address, phone number) is retained for the duration
              of the active campaign and for up to{' '}
              {process.env.DATA_RETENTION_MONTHS || '12'} months after the campaign concludes. After
              this period, personal information is automatically anonymised. Booking records are
              retained for longer periods for billing and accounting purposes.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">8. Your privacy rights</h2>
            <p className="text-muted-foreground leading-relaxed">
              Under the Privacy Act 1988 and the Australian Privacy Principles, you have the right
              to:
            </p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>
                <strong className="text-foreground">Access</strong> — request access to the personal
                information we hold about you
              </li>
              <li>
                <strong className="text-foreground">Correction</strong> — request correction of
                inaccurate, out-of-date, or incomplete information
              </li>
              <li>
                <strong className="text-foreground">Deletion</strong> — request deletion of your
                personal information where we are not required by law to retain it
              </li>
              <li>
                <strong className="text-foreground">Unsubscribe</strong> — opt out of all future
                emails and SMS at any time using the links in our messages
              </li>
            </ul>
            <p className="text-muted-foreground leading-relaxed">
              To exercise these rights, reply directly to any message you have received or contact
              us at the details below. We will respond within 30 days.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">9. Security</h2>
            <p className="text-muted-foreground leading-relaxed">
              We take reasonable steps to protect personal information from misuse, interference,
              loss, and unauthorised access. Data is stored in access-controlled cloud
              infrastructure using industry-standard encryption in transit (HTTPS/TLS) and at rest.
              Access to personal information is restricted to authorised staff only.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">10. Complaints</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have a concern about how we have handled your personal information, please
              contact us in the first instance using the details below. We will investigate and
              respond within 30 days.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              If you are not satisfied with our response, you may lodge a complaint with the{' '}
              <strong className="text-foreground">
                Office of the Australian Information Commissioner (OAIC)
              </strong>
              :{' '}
              <a
                href="https://www.oaic.gov.au"
                className="text-foreground underline"
              >
                www.oaic.gov.au
              </a>{' '}
              · 1300 363 992.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">11. Contact us</h2>
            <p className="text-muted-foreground leading-relaxed">
              {agencyName}
              <br />
              {agencyAddress}
            </p>
          </section>
        </div>

        {/* Footer links */}
        <div className="pt-8 border-t border-border">
          <a
            href="/terms"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors underline"
          >
            Terms of Service
          </a>
        </div>
      </div>
    </div>
  )
}
