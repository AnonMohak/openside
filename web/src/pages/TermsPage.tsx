import { Link } from "react-router-dom";

import LegalLayout, {
  LegalEmail,
  LegalList,
  LegalSection,
} from "@/components/legal/LegalLayout";

const TermsPage = () => (
  <LegalLayout
    title="Terms of Service"
    description="The terms for using the hosted Openside service."
    updated="October 23, 2026"
  >
    <LegalSection title="Agreement">
      <p>
        These terms govern your use of the hosted Openside service at
        openside.pro ("Openside", "we", "us"). By creating an account or using
        Openside, you agree to these terms and to our{" "}
        <Link
          to="/privacy"
          className="font-medium text-(--landing-brand-text) underline-offset-4 hover:underline"
        >
          Privacy Policy
        </Link>
        . If you do not agree, do not use the service.
      </p>
      <p>
        The Openside source code is released under the MIT License. These
        terms cover the hosted service we run, not your use of the code. A
        copy you deploy yourself is governed by the MIT License alone.
      </p>
    </LegalSection>

    <LegalSection title="Your account">
      <LegalList
        items={[
          "You must be at least 13 years old, or the minimum age in your country, to use Openside.",
          "Keep your sign-in details secure. You are responsible for activity on your account.",
          "Give us accurate information and keep it up to date.",
        ]}
      />
    </LegalSection>

    <LegalSection title="Recording and consent">
      <p>
        You are responsible for getting consent from everyone you record. Many
        places require all participants to agree before a call is recorded.
        Make sure the people in your space know they are being recorded and
        that you follow the laws that apply to you and them.
      </p>
    </LegalSection>

    <LegalSection title="Your content">
      <p>
        You own the recordings, comments, and other content you create with
        Openside. You give us permission to host, store, process, and deliver
        that content only as needed to run the service for you, such as
        processing recordings into downloadable files or serving them through
        share links you create.
      </p>
      <p>
        You are responsible for your content and for who you share it with.
        Anyone with an active share link can watch that recording, so disable
        the link when you no longer want it shared.
      </p>
    </LegalSection>

    <LegalSection title="Acceptable use">
      <p>You agree not to use Openside to:</p>
      <LegalList
        items={[
          "Record people without the consent the law requires.",
          "Upload or share content that is illegal, infringes someone's rights, or exploits or harms minors.",
          "Harass, threaten, or impersonate others.",
          "Distribute malware, spam, or phishing.",
          "Probe, disrupt, or overload the service, or get around plan limits or security measures.",
          "Resell or provide the hosted service to others without our permission.",
        ]}
      />
      <p>
        We may remove content or suspend accounts that break these rules.
      </p>
    </LegalSection>

    <LegalSection title="Plans and billing">
      <LegalList
        items={[
          "The Demo plan is free and has limits on quality, length, participants, and retention, as shown on our pricing page.",
          "Pro is a paid monthly subscription. Payments are processed by Polar, which acts as the merchant of record and handles taxes, invoices, and refunds.",
          "Subscriptions renew automatically until you cancel. When you cancel, you keep Pro until the end of the current billing period.",
          "Using your own LiveKit and storage keys is free. You pay those providers directly for the infrastructure you use.",
          "We may change prices or plan limits. We will give you notice before a price change affects your subscription.",
        ]}
      />
    </LegalSection>

    <LegalSection title="Retention and deletion">
      <p>
        Recordings on our infrastructure are deleted automatically after your
        plan's retention window: 48 hours on Demo and 30 days on Pro.
        Download anything you want to keep before then. We do not delete
        recordings stored on your own infrastructure. Deleted recordings
        cannot be recovered.
      </p>
    </LegalSection>

    <LegalSection title="Self-hosted keys">
      <p>
        If you connect your own LiveKit or storage, you are responsible for
        those accounts, their costs, and the data stored in them. We are not
        responsible for outages, charges, or data loss on infrastructure you
        control.
      </p>
    </LegalSection>

    <LegalSection title="Availability and changes">
      <p>
        We work to keep Openside reliable, but we do not guarantee it will
        always be available or free of errors. We may add, change, or remove
        features, and we may suspend or end the service. If we shut down the
        hosted service, we will give reasonable notice so you can download
        your recordings.
      </p>
    </LegalSection>

    <LegalSection title="Ending your account">
      <p>
        You can stop using Openside at any time. To delete your account,
        email <LegalEmail />. We may suspend or close accounts that break
        these terms or put the service or other users at risk.
      </p>
    </LegalSection>

    <LegalSection title="Disclaimers">
      <p>
        Openside is provided "as is" and "as available", without warranties
        of any kind, whether express or implied, including warranties of
        merchantability, fitness for a particular purpose, and
        non-infringement.
      </p>
    </LegalSection>

    <LegalSection title="Limitation of liability">
      <p>
        To the fullest extent the law allows, we are not liable for any
        indirect, incidental, special, consequential, or punitive damages, or
        for lost data, profits, or revenue. Our total liability for any claim
        about the service is limited to the amount you paid us in the 12
        months before the claim, or $50 if you have not paid us anything.
      </p>
    </LegalSection>

    <LegalSection title="Indemnity">
      <p>
        You agree to defend and indemnify Openside against claims arising from
        your content, your recordings, or your breach of these terms or the
        law.
      </p>
    </LegalSection>

    <LegalSection title="Changes to these terms">
      <p>
        We may update these terms. If a change is material, we will update
        the date at the top of this page and, where appropriate, let you know
        by email or in the app. Continuing to use Openside after a change
        means you accept the updated terms.
      </p>
    </LegalSection>

    <LegalSection title="Contact">
      <p>
        Questions about these terms? Email <LegalEmail />.
      </p>
    </LegalSection>
  </LegalLayout>
);

export default TermsPage;
