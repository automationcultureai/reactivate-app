import { Zap } from 'lucide-react'

export default function PrivacyPage() {
  const agencyName = process.env.AGENCY_NAME || 'Reactivate Agency'
  const agencyAddress = process.env.AGENCY_ADDRESS || ''

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-6 py-16 space-y-10">
        {/* Brand */}
        <div className="flex items-center gap-2 text-muted-foreground/50">
          <Zap className="w-4 h-4" />
          <span className="text-sm font-medium">Reactivate</span>
        </div>

        {/* Title */}
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold text-foreground">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground">
            Last updated: {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-8 text-foreground">

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">1. Who we are</h2>
            <p className="text-muted-foreground leading-relaxed">
              {agencyName} operates a reactivation campaign platform (&ldquo;the Service&rdquo;) on behalf of small
              business clients. {agencyAddress && <span>{agencyAddress}.</span>} We act as a data processor on behalf
              of the business clients who use our Service, who are the data controllers for their customers&apos; data.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">2. What data we collect</h2>
            <p className="text-muted-foreground leading-relaxed">
              When our clients upload contact lists, we collect and process the following personal data about
              their past customers (&ldquo;leads&rdquo;):
            </p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Full name</li>
              <li>Email address</li>
              <li>Phone number (where applicable)</li>
              <li>Appointment history and booking status</li>
              <li>Email engagement data (opens, clicks)</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed">
              This data is provided by our business clients and relates to individuals who have a pre-existing
              relationship with those businesses.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">3. Legal basis for processing</h2>
            <p className="text-muted-foreground leading-relaxed">
              We process personal data on the basis of legitimate interests — specifically, our clients&apos; legitimate
              interest in re-engaging past customers with whom they have a prior business relationship. Our clients
              are required to confirm the legal basis for contacting each lead before any messages are sent.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">4. How we use your data</h2>
            <p className="text-muted-foreground leading-relaxed">We use personal data to:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Send personalised reactivation emails and SMS messages on behalf of the business</li>
              <li>Process appointment bookings via our booking system</li>
              <li>Track communication engagement to improve campaign relevance</li>
              <li>Enable businesses to mark jobs as complete and process commissions</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed">
              We do not sell, rent, or share personal data with any third party for their own marketing purposes.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">5. Data retention</h2>
            <p className="text-muted-foreground leading-relaxed">
              Personal data (name, email, phone number) is retained for the duration of the active campaign and
              for up to {process.env.DATA_RETENTION_MONTHS || '12'} months after the campaign completes. After this
              period, personal data is automatically anonymised. Booking and commission records are retained for
              longer periods for billing and legal compliance purposes.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">6. Your rights</h2>
            <p className="text-muted-foreground leading-relaxed">
              Under UK GDPR and the Data Protection Act 2018, you have the following rights:
            </p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li><strong className="text-foreground">Right to access</strong> — request a copy of your personal data</li>
              <li><strong className="text-foreground">Right to rectification</strong> — request correction of inaccurate data</li>
              <li><strong className="text-foreground">Right to erasure</strong> — request deletion of your personal data</li>
              <li><strong className="text-foreground">Right to object</strong> — object to processing based on legitimate interests</li>
              <li><strong className="text-foreground">Right to unsubscribe</strong> — every email contains an unsubscribe link</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed">
              To exercise any of these rights, reply directly to any email you have received, or contact the
              business that sent you the message. They will forward erasure or access requests to us.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">7. Unsubscribing</h2>
            <p className="text-muted-foreground leading-relaxed">
              Every email we send contains an unsubscribe link at the bottom. Clicking it will immediately stop
              all future emails from this campaign. For SMS, reply STOP to any message. Your opt-out is recorded
              permanently and honoured across all future sends.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">8. Security</h2>
            <p className="text-muted-foreground leading-relaxed">
              Personal data is stored in a secure, access-controlled database. We use industry-standard encryption
              in transit (HTTPS) and at rest. Access to personal data is restricted to authorised agency staff only.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">9. Contact</h2>
            <p className="text-muted-foreground leading-relaxed">
              For any privacy-related queries, please contact{' '}
              {agencyName}{agencyAddress ? `, ${agencyAddress}` : ''}.
              You also have the right to lodge a complaint with the Information Commissioner&apos;s Office (ICO)
              at{' '}
              <a href="https://ico.org.uk" className="text-foreground underline">
                ico.org.uk
              </a>
              .
            </p>
          </section>
        </div>

        {/* Footer links */}
        <div className="pt-8 border-t border-border">
          <a href="/terms" className="text-xs text-muted-foreground hover:text-foreground transition-colors underline">
            Terms of Service
          </a>
        </div>
      </div>
    </div>
  )
}
