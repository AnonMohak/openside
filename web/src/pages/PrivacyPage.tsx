import { Link } from "react-router-dom";

import LegalLayout, {
  LegalEmail,
  LegalList,
  LegalSection,
} from "@/components/legal/LegalLayout";

const strong = (text: string) => (
  <strong className="font-semibold text-foreground">{text}</strong>
);

const PrivacyPage = () => (
  <LegalLayout
    title="Privacy Policy"
    description="How Openside collects, uses, and protects your data."
    updated="October 23, 2026"
  >
    <LegalSection title="Overview">
      <p>
        This policy explains what information Openside ("Openside", "we",
        "us") collects when you use the hosted service at openside.pro, how we
        use it, and the choices you have. Openside is open source, so you can
        also read the code to see exactly how your data is handled.
      </p>
      <p>
        If you run your own copy of Openside, this policy does not apply to
        that deployment. Whoever operates it is responsible for the data it
        handles.
      </p>
    </LegalSection>

    <LegalSection title="Information we collect">
      <LegalList
        items={[
          <>
            {strong("Account details.")} Your name, email address, and profile
            picture when you sign up, either directly or through Google. Sign-in
            is handled by our authentication provider.
          </>,
          <>
            {strong("Recordings.")} The audio, video, and screen recordings you
            and your participants make, along with the processed files we
            create from them (mixed recordings and separate tracks).
          </>,
          <>
            {strong("Spaces and participants.")} Space titles and descriptions,
            scheduled times, invitee email addresses you enter, and the display
            names of people who join, including guests without an account.
          </>,
          <>
            {strong("Comments and sharing.")} Comments left on shared
            recordings, the name shown with them, and view counts on share
            links.
          </>,
          <>
            {strong("Settings and usage.")} Your recording preferences and how
            many minutes you have recorded, which we use to apply your plan's
            limits.
          </>,
          <>
            {strong("Self-host keys.")} If you connect your own LiveKit and
            storage, the URLs and keys you provide. Keys are encrypted with
            AES-256-GCM before they are stored and are never shown back in
            full.
          </>,
          <>
            {strong("Billing.")} If you subscribe, our payment provider
            processes your payment details. We only receive your customer and
            subscription IDs and your subscription status, not your card
            number.
          </>,
          <>
            {strong("Technical data.")} IP addresses and basic request data
            that our servers and providers log to run the service, prevent
            abuse, and debug problems.
          </>,
        ]}
      />
    </LegalSection>

    <LegalSection title="How we use your information">
      <LegalList
        items={[
          "To run Openside: host calls, record, upload, process, store, and deliver your recordings.",
          "To send emails you ask for, such as invites to a scheduled space.",
          "To apply plan limits, handle subscriptions, and keep your account secure.",
          "To prevent abuse, fix bugs, and keep the service reliable.",
        ]}
      />
      <p>
        We do not sell your personal information, show you ads, or use your
        recordings to train AI models.
      </p>
    </LegalSection>

    <LegalSection title="How recordings are handled">
      <p>
        Recordings are captured in your browser and uploaded in small chunks
        directly to storage over an encrypted connection. Recordings are
        private by default. Other people can only watch one if you create a
        share link, and you can disable or replace that link at any time.
      </p>
      <p>
        If you turn on cloud backup, a mixed copy of the call is also recorded
        on the server side as a fallback.
      </p>
    </LegalSection>

    <LegalSection title="Who we share data with">
      <p>
        We use a small number of providers to run Openside. They only process
        your data to provide their service to us:
      </p>
      <LegalList
        items={[
          <>{strong("Clerk")} for sign-in and account management.</>,
          <>{strong("LiveKit")} for real-time audio and video calls.</>,
          <>{strong("Cloudflare")} for hosting the website and storing recordings (R2).</>,
          <>{strong("Railway")} for hosting our servers and database.</>,
          <>{strong("Polar")} for payments and subscriptions.</>,
          <>{strong("Resend")} for sending invite emails.</>,
          <>{strong("Google")} if you choose to sign in with your Google account.</>,
        ]}
      />
      <p>
        If you use your own LiveKit and storage keys, your calls and
        recordings go to your own infrastructure instead. We may also disclose
        information if the law requires it, or to protect the rights and
        safety of our users or the service.
      </p>
    </LegalSection>

    <LegalSection title="How long we keep data">
      <LegalList
        items={[
          "Demo plan recordings are deleted automatically 48 hours after they finish.",
          "Pro plan recordings are deleted automatically 30 days after they finish.",
          "Recordings stored on your own infrastructure are never deleted by us.",
          "You can delete any recording yourself at any time. It is removed from storage, not just hidden.",
          "Account details are kept while your account is active. Ask us to delete your account and we will remove it.",
        ]}
      />
    </LegalSection>

    <LegalSection title="Cookies and local storage">
      <p>
        We use cookies and browser storage only to keep you signed in,
        remember preferences such as your theme, and keep recordings safe
        while they upload. We do not use advertising or third-party tracking
        cookies.
      </p>
    </LegalSection>

    <LegalSection title="Security">
      <p>
        Data is encrypted in transit, and self-host keys are encrypted at
        rest. No system is perfectly secure, but we work to protect your data
        and will tell you without undue delay if a breach affects you.
      </p>
    </LegalSection>

    <LegalSection title="Your rights">
      <p>
        You can access, correct, download, or delete your data. Most of this
        you can do yourself from your dashboard: edit your profile, download
        or delete recordings, and manage share links. For anything else,
        including deleting your account or a copy of your data, email us at{" "}
        <LegalEmail />. Depending on where you live, you may have extra rights
        under laws such as the GDPR or CCPA, and you can contact your local
        data protection authority.
      </p>
    </LegalSection>

    <LegalSection title="Children">
      <p>
        Openside is not intended for children under 13 (or the minimum age in
        your country), and we do not knowingly collect their data.
      </p>
    </LegalSection>

    <LegalSection title="Changes to this policy">
      <p>
        If we make material changes, we will update the date at the top of
        this page and, where appropriate, let you know by email or in the app.
        See also our <Link to="/terms" className="font-medium text-(--landing-brand-text) underline-offset-4 hover:underline">Terms of Service</Link>.
      </p>
    </LegalSection>

    <LegalSection title="Contact">
      <p>
        Questions about privacy? Email <LegalEmail />.
      </p>
    </LegalSection>
  </LegalLayout>
);

export default PrivacyPage;
