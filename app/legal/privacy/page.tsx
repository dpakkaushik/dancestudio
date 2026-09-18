import type { Metadata } from "next";
import { LegalDoc } from "@/features/legal/components/LegalDoc";

export const metadata: Metadata = {
  title: "Privacy Policy — DanceOS",
  description: "What DanceOS collects, why, who sees it, how long it is kept, and your rights under India's Digital Personal Data Protection Act, 2023.",
};

/** /legal/privacy — the Privacy Policy the sign-up screen points at (18 Sep
 *  2026), written against what the app really stores and who really reads it:
 *  the profile fields, the pictures, the bookings and the payments; Supabase in
 *  Mumbai for the data, Cashfree for money, Google for maps, Resend for email,
 *  Vercel for the pages. Aligned to the DPDP Act, 2023 — consent at sign-up,
 *  the rights it names, a grievance channel — and honest that the postal
 *  address and named officer follow at launch. */
export default function PrivacyPage() {
  return (
    <LegalDoc title="Privacy Policy" updated="Updated 18 September 2026" intro="This is what DanceOS collects about you, why, who else sees it, how long it stays, and what you can ask us to do with it.">
      <h2>1. What we collect</h2>
      <ul>
        <li>
          <b>What you give us.</b> Your name, email address and password when you sign up; your city; your dance styles, a short About, your age and your social links if you add them; a phone number if you choose to publish one; your profile picture and header pictures. An organization gives its name, city, logo and GST number; a studio gives its address, its social links and photographs of its space.
        </li>
        <li>
          <b>What you do.</b> Classes and events you book, tickets you hold, crews you lead or join, classes you teach or assist, enquiries you send and quotes you answer, studios and people you follow, reports you make, and messages you send DanceOS.
        </li>
        <li>
          <b>Money.</b> The amount, method and status of each payment, refund and subscription. Card numbers and UPI credentials go to Cashfree and never to us.
        </li>
        <li>
          <b>Your device.</b> The technical details any website receives: your IP address, browser and device type, and the pages you open, kept in short-lived server logs.
        </li>
      </ul>

      <h2>2. Why we use it</h2>
      <ul>
        <li>To run the service: to show you classes near your city, to book a seat, to take a payment and refund it, to tell a studio who is coming, to tell you when a seat frees up.</li>
        <li>To keep the place trustworthy: to verify a studio, to act on a report, to suspend an account that breaks the terms.</li>
        <li>To tell you what needs you: notifications in the app about your bookings, asks, quotes and money.</li>
        <li>We do not sell your data, and we do not use it to advertise to you.</li>
      </ul>

      <h2>3. Your consent</h2>
      <p>
        When you create an account you agree to this policy and consent to DanceOS processing the details above for the purposes above, as the Digital Personal Data Protection Act, 2023 asks. You can withdraw that consent at any time by asking us to delete your account; the service cannot run without the details it runs on, so withdrawing consent ends the account.
      </p>

      <h2>4. What is public</h2>
      <ul>
        <li>A studio&apos;s public page, a crew&apos;s page and a published class or event are visible to anybody, signed in or not, including the studio&apos;s pictures once it is listed.</li>
        <li>Your profile — name, city, styles, About, links, your record and the number you chose to publish — is visible to signed-in DanceOS users. If you take the Artist plan, your name and picture appear beside the classes you teach.</li>
        <li>What you booked, what you paid, what you were quoted and who follows whom are private to you and to the business on the other side of it.</li>
      </ul>

      <h2>5. Who else sees it</h2>
      <ul>
        <li>
          <b>Supabase</b> hosts the database and the pictures, in Mumbai, India.
        </li>
        <li>
          <b>Cashfree Payments</b> processes payments, refunds and subscription mandates, and receives your name, email, phone number where required and the amount.
        </li>
        <li>
          <b>Google Maps</b> receives the address or place you search for when you set a location or look for studios near you.
        </li>
        <li>
          <b>Resend</b> delivers the emails DanceOS sends you, such as the link that confirms your address.
        </li>
        <li>
          <b>Vercel</b> serves the pages and receives the technical details in section 1.
        </li>
        <li>The studios, artists, organizations and crews you deal with see what you send them: a booking, an enquiry, an ask, an answer.</li>
      </ul>

      <h2>6. How long we keep it</h2>
      <p>
        For as long as your account exists. When something is deleted in the app it is first marked deleted and hidden, so a mistake can be undone; pictures you remove are deleted from storage. Records of payments and refunds are kept for as long as Indian tax and payment rules require. When you ask for your account to be deleted, everything that is yours goes with it, except those money records.
      </p>

      <h2>7. Your rights</h2>
      <ul>
        <li>To see what we hold about you, and to correct it. Most of it is on your profile and in your settings, where you can change it yourself.</li>
        <li>To have your account and your data erased.</li>
        <li>To withdraw your consent, as in section 3.</li>
        <li>To complain. Write to us through Settings → Help &amp; support → Message DanceOS, and we will answer within the time the law allows. If we do not resolve it, you may approach the Data Protection Board of India.</li>
        <li>To name somebody to act for you if you cannot.</li>
      </ul>

      <h2>8. Children</h2>
      <p>DanceOS is not for children under 13. Between 13 and 18 a parent or guardian agrees to these terms on your behalf. If we learn we hold a child&apos;s details without that, we delete them.</p>

      <h2>9. Security</h2>
      <p>
        Your data is stored under row-level rules that let each person read only what is theirs to read, and every write goes through checks on the server. Payments never touch our servers. No system is perfect; if something goes wrong that affects you, we will tell you and the authorities the law names.
      </p>

      <h2>10. Grievance officer and changes</h2>
      <ul>
        <li>Until public launch, the grievance channel is Settings → Help &amp; support → Message DanceOS, read by the DanceOS team. A named Grievance Officer and a postal address will be published here before launch.</li>
        <li>This policy may change as DanceOS does. The date at the top says when it last did, and a change that matters to you will be announced in the app before it applies.</li>
      </ul>
    </LegalDoc>
  );
}
