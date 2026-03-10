import { Zap } from 'lucide-react'

export default function TermsPage() {
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
          <h1 className="text-3xl font-semibold text-foreground">Terms of Service</h1>
          <p className="text-sm text-muted-foreground">
            Last updated: {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>

        <div className="space-y-8 text-foreground">

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">1. Agreement</h2>
            <p className="text-muted-foreground leading-relaxed">
              These Terms of Service (&ldquo;Terms&rdquo;) govern the use of the reactivation campaign platform
              (&ldquo;the Service&rdquo;) provided by {agencyName}
              {agencyAddress ? ` (${agencyAddress})` : ''} (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;).
              By accessing or using the Service, client businesses (&ldquo;Client&rdquo;) agree to these Terms.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">2. Service description</h2>
            <p className="text-muted-foreground leading-relaxed">
              The Service enables Clients to run AI-powered email and SMS reactivation campaigns targeting their
              dormant past customers. We generate personalised message sequences using AI, manage delivery, and
              provide booking infrastructure for appointment scheduling.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              The Service is not a cold outreach tool. Clients may only upload contacts with whom they have a
              genuine prior business relationship. Use of the Service for cold prospecting, spam, or any
              unsolicited commercial messaging is strictly prohibited.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">3. Client obligations</h2>
            <p className="text-muted-foreground leading-relaxed">By using the Service, the Client warrants that:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>All contacts uploaded have a genuine prior relationship with the Client&apos;s business</li>
              <li>The Client has a lawful basis for contacting each lead under applicable data protection law</li>
              <li>The Client will not upload inaccurate, false, or fabricated contact data</li>
              <li>The Client will promptly handle any erasure or access requests forwarded by us</li>
              <li>The Client will accurately mark jobs as complete in the dashboard</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">4. Commission model</h2>
            <p className="text-muted-foreground leading-relaxed">
              We charge a flat fee per completed job, as agreed individually with each Client at onboarding.
              A job is considered &ldquo;completed&rdquo; when the Client marks it as such in their dashboard,
              or when it is automatically completed after{' '}
              {process.env.AUTO_COMPLETE_DAYS || '3'} days following the scheduled appointment date.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Commission is tracked in the platform and invoiced separately. We do not automatically charge
              payment cards. Clients may raise a dispute on any completed booking within a reasonable period.
              Disputes are reviewed and resolved at our discretion.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Cancelled bookings do not attract a commission charge. Jobs completed by the Client&apos;s customer
              cancelling after the appointment date are still commissionable unless a dispute is upheld.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">5. Acceptable use</h2>
            <p className="text-muted-foreground leading-relaxed">The Client must not use the Service to:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Send messages to individuals who have previously opted out or requested erasure</li>
              <li>Misrepresent the nature of the business or the relationship with contacts</li>
              <li>Send misleading, deceptive, or harmful content</li>
              <li>Circumvent or attempt to circumvent opt-out mechanisms</li>
              <li>Upload contact data obtained illegally or without appropriate consent</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">6. Limitation of liability</h2>
            <p className="text-muted-foreground leading-relaxed">
              The Service is provided &ldquo;as is&rdquo;. We make no guarantees regarding email deliverability,
              response rates, booking volumes, or revenue generated. Campaign performance depends on factors
              outside our control including email filtering, contact data quality, and market conditions.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              To the maximum extent permitted by law, our total liability for any claim arising from use of the
              Service shall not exceed the total commission fees paid by the Client in the three months preceding
              the claim.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">7. Data processing</h2>
            <p className="text-muted-foreground leading-relaxed">
              The Client is the data controller for all personal data uploaded to the Service. We act as a data
              processor and handle personal data only in accordance with the Client&apos;s instructions and our{' '}
              <a href="/privacy" className="text-foreground underline">Privacy Policy</a>.
              The Client is responsible for ensuring they have a lawful basis for the processing and for
              responding to any data subject requests relating to their contacts.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">8. Termination</h2>
            <p className="text-muted-foreground leading-relaxed">
              Either party may terminate the relationship with 30 days&apos; written notice. Outstanding commission
              invoices remain payable on termination. We reserve the right to suspend or terminate access
              immediately if the Client breaches these Terms.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">9. Governing law</h2>
            <p className="text-muted-foreground leading-relaxed">
              These Terms are governed by the laws of England and Wales. Any disputes shall be subject to the
              exclusive jurisdiction of the courts of England and Wales.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">10. Contact</h2>
            <p className="text-muted-foreground leading-relaxed">
              For any questions about these Terms, contact {agencyName}
              {agencyAddress ? `, ${agencyAddress}` : ''}.
            </p>
          </section>
        </div>

        {/* Footer links */}
        <div className="pt-8 border-t border-border">
          <a href="/privacy" className="text-xs text-muted-foreground hover:text-foreground transition-colors underline">
            Privacy Policy
          </a>
        </div>
      </div>
    </div>
  )
}
