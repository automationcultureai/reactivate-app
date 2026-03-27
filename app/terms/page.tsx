import { Zap } from 'lucide-react'

export default function TermsPage() {
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
          <h1 className="text-3xl font-semibold text-foreground">Terms of Service</h1>
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
            <h2 className="text-lg font-semibold">1. Agreement</h2>
            <p className="text-muted-foreground leading-relaxed">
              These Terms of Service (&ldquo;Terms&rdquo;) govern the use of the reactivation
              campaign platform (&ldquo;the Service&rdquo;) provided by {agencyName},{' '}
              {agencyAddress} (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;). By accessing
              or using the Service, business clients (&ldquo;Client&rdquo;) agree to these Terms in
              full.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">2. Service description</h2>
            <p className="text-muted-foreground leading-relaxed">
              The Service enables Clients to run AI-powered email and SMS reactivation campaigns
              targeting their dormant past customers. We generate personalised message sequences
              using AI, manage message delivery, and provide booking infrastructure for appointment
              scheduling.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              The Service is designed exclusively for re-engaging existing customers. It is{' '}
              <strong className="text-foreground">not</strong> a cold outreach or lead generation
              tool. Clients may only upload contact details for individuals with whom they have a
              genuine, documented prior business relationship. Use of the Service to contact
              individuals without such a relationship constitutes a breach of these Terms and may
              also breach the <em>Spam Act 2003</em> (Cth).
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">3. Client obligations</h2>
            <p className="text-muted-foreground leading-relaxed">
              By using the Service, the Client warrants and agrees that:
            </p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>
                All contacts uploaded have a genuine prior business relationship with the Client
              </li>
              <li>
                The Client has a lawful basis for contacting each lead under the{' '}
                <em>Spam Act 2003</em> (Cth), the <em>Privacy Act 1988</em> (Cth), and any other
                applicable law
              </li>
              <li>Contact data is accurate, current and obtained lawfully</li>
              <li>The Client will not upload data of individuals who have previously opted out</li>
              <li>
                The Client will promptly handle any privacy or erasure requests forwarded by us
              </li>
              <li>
                The Client will accurately and promptly mark jobs as complete in the dashboard
              </li>
              <li>
                The Client holds any licences, registrations, or insurance required to operate their
                business
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">4. Commission model</h2>
            <p className="text-muted-foreground leading-relaxed">
              We charge a flat commission fee per completed job, as agreed with each Client at
              onboarding. A job is considered &ldquo;completed&rdquo; when:
            </p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>The Client marks the appointment as complete in their dashboard; or</li>
              <li>
                The appointment date passes by more than{' '}
                {process.env.AUTO_COMPLETE_DAYS || '3'} days without the Client marking it otherwise
                (auto-complete)
              </li>
            </ul>
            <p className="text-muted-foreground leading-relaxed">
              Commission is tracked within the platform and invoiced separately via a commission
              report. We do not automatically debit payment methods. Cancelled appointments do not
              attract a commission charge. Clients may raise a dispute on any completed booking
              through their dashboard; disputes are reviewed and resolved at our reasonable
              discretion.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">5. Acceptable use</h2>
            <p className="text-muted-foreground leading-relaxed">The Client must not:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>
                Send messages to individuals who have previously opted out or requested deletion of
                their data
              </li>
              <li>Upload false, fabricated, or unlawfully obtained contact data</li>
              <li>
                Use the Service for cold prospecting, bulk unsolicited messaging, or any purpose
                inconsistent with the <em>Spam Act 2003</em>
              </li>
              <li>Misrepresent the nature of the business or prior relationship with contacts</li>
              <li>Interfere with the security or integrity of the platform</li>
              <li>Resell or sublicence access to the Service without our written consent</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">6. Australian Consumer Law</h2>
            <p className="text-muted-foreground leading-relaxed">
              Our services come with guarantees that cannot be excluded under the{' '}
              <em>Australian Consumer Law</em> (Schedule 2 to the{' '}
              <em>Competition and Consumer Act 2010</em> (Cth)). For major failures with the Service
              you are entitled to cancel and receive a refund for the unused portion, or to
              compensation for any reasonably foreseeable loss or damage. For minor failures, we may
              choose to repair or re-supply the service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">7. Limitation of liability</h2>
            <p className="text-muted-foreground leading-relaxed">
              Subject to clause 6 and to the maximum extent permitted by law, we make no guarantee
              regarding email deliverability, response rates, booking volumes, or revenue generated.
              Campaign performance depends on factors outside our control including email filtering,
              contact data quality, and market conditions.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Our total liability for any claim arising from use of the Service (other than as set
              out in clause 6) shall not exceed the total commission fees paid by the Client in the
              three calendar months preceding the date the claim arose.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">8. Privacy</h2>
            <p className="text-muted-foreground leading-relaxed">
              The Client is responsible as data controller for the personal information of their
              customers that is uploaded to the Service. We act as a service provider and handle
              personal information only in accordance with the Client&apos;s instructions and our{' '}
              <a href="/privacy" className="text-foreground underline">
                Privacy Policy
              </a>
              . Both parties agree to comply with the <em>Privacy Act 1988</em> (Cth) and the
              Australian Privacy Principles in relation to any personal information handled under
              these Terms.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">9. Termination</h2>
            <p className="text-muted-foreground leading-relaxed">
              Either party may end the engagement with 30 days&apos; written notice. Outstanding
              commission invoices remain payable on termination. We may suspend or terminate access
              immediately if the Client breaches these Terms, engages in unlawful conduct, or fails
              to pay overdue invoices after reasonable notice.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">10. Governing law</h2>
            <p className="text-muted-foreground leading-relaxed">
              These Terms are governed by the laws of the State of Victoria and the Commonwealth of
              Australia. Both parties submit to the non-exclusive jurisdiction of the courts of
              Victoria for the resolution of any dispute arising from or in connection with these
              Terms.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">11. Contact</h2>
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
            href="/privacy"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors underline"
          >
            Privacy Policy
          </a>
        </div>
      </div>
    </div>
  )
}
