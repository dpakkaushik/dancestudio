import type { Metadata } from "next";
import { LegalDoc } from "@/features/legal/components/LegalDoc";

export const metadata: Metadata = {
  title: "Terms of Use — DanceOS",
  description: "The terms on which DanceOS is offered: accounts, bookings, payments, content and conduct.",
};

/** /legal/terms — the Terms of Use the sign-up screen points at (18 Sep 2026).
 *  Written to what the app actually does: independent studios, artists and
 *  organizations listing classes and events; bookings and subscriptions paid
 *  through Cashfree; enquiries recorded, not brokered; consent before anybody
 *  is put on a roster; verification of studios by DanceOS. A first draft for a
 *  lawyer to finish, and honest about that in its last section. */
export default function TermsPage() {
  return (
    <LegalDoc title="Terms of Use" updated="Updated 18 September 2026" intro="DanceOS is where India dances: a place to find classes, run a studio, build a crew and be booked. These terms are the agreement between you and DanceOS when you use it.">
      <h2>1. Who we are, and what DanceOS is</h2>
      <p>
        DanceOS is a platform. It lists dance classes, studios, artists, crews and events, lets people book and pay for them, and gives the people who run them the tools to do so. The classes, events and services on DanceOS are offered by independent studios, artists and organizations, not by DanceOS. When you book a class you are entering an arrangement with the studio or artist running it; DanceOS records it and moves the money.
      </p>

      <h2>2. Your account</h2>
      <ul>
        <li>You need an account to book, teach, run a studio or join a crew. You sign up with an email address and a password, and you keep them to yourself.</li>
        <li>You must be at least 13 to use DanceOS. If you are under 18, a parent or guardian must agree to these terms for you and may be asked to confirm a booking or a payment.</li>
        <li>An account is one person, or one organization. An organization account runs studios and hosts events; it does not book classes, join crews or enter competitions as a person.</li>
        <li>Give us true details. A studio or an artist that is verified by DanceOS was verified on what it showed us; if it turns out to be false, the badge goes and the account may be suspended.</li>
      </ul>

      <h2>3. Bookings, tickets and refunds</h2>
      <ul>
        <li>A seat in a class or at an event is yours once the booking is confirmed and, for a priced one, once the payment has landed. A booking that waits for payment holds no seat.</li>
        <li>Payments are processed by Cashfree Payments India Pvt. Ltd. DanceOS never sees or stores your card number or UPI credentials.</li>
        <li>Cancelling a class booking or an event ticket more than 48 hours before it starts refunds you automatically. Inside 48 hours the studio or organiser decides, and tells you through the app. Refunds go back the way you paid, on the payment provider&apos;s timeline.</li>
        <li>A waitlist is a promise to be told, not a seat. If a seat frees up you are told, and for a priced class the seat goes back on sale.</li>
        <li>Prices are set by the studio, artist or organiser and are shown before you pay.</li>
      </ul>

      <h2>4. Subscriptions</h2>
      <ul>
        <li>A studio is public on DanceOS while its subscription is live. The Artist plan unlocks an artist&apos;s tools while it is live. Both renew monthly through a payment mandate you authorise.</li>
        <li>Cancelling a subscription stops it renewing. What you have paid for stays yours until the period you paid for ends.</li>
        <li>Prices are shown before you subscribe. A price change applies to new subscriptions; an existing one keeps the price it started at.</li>
      </ul>

      <h2>5. Teaching, teams and crews</h2>
      <ul>
        <li>Nobody is put on a class, a team or a crew roster without agreeing to it. Every such ask is answered by the person asked, in the app.</li>
        <li>A studio pays the people who teach for it directly. DanceOS records what was paid; it does not run payroll and does not hold that money.</li>
        <li>Enquiries sent through DanceOS, and the quotes that answer them, are between you and the business or crew you sent them to. DanceOS records them.</li>
      </ul>

      <h2>6. Content and conduct</h2>
      <ul>
        <li>You own the pictures and words you put on DanceOS. You give DanceOS the right to show them on the pages they belong to, to the people those pages are for.</li>
        <li>Upload only what is yours to upload, and nothing unlawful, hateful or deceptive. Do not impersonate a person, a studio or a crew.</li>
        <li>Anybody can report a page. DanceOS may take a page off Discover, remove content or suspend an account over a report, and will tell the account why. Putting it back is DanceOS&apos;s call.</li>
      </ul>

      <h2>7. Verification</h2>
      <p>
        A studio asks to be verified by showing DanceOS its social links and photographs of its space; DanceOS reviews them and, if satisfied, gives the studio its badge. An organization enters a GST number before it may host events. Verification says DanceOS looked; it is not a guarantee of anything a studio, artist or organization does.
      </p>

      <h2>8. What DanceOS is not responsible for</h2>
      <p>
        DanceOS is provided as it is. DanceOS does not run the classes, teach the sessions, host the events or employ the people you meet through it, and is not responsible for what happens in a studio, at a venue or between you and a business. To the extent the law allows, DanceOS&apos;s liability to you is limited to the amount you paid DanceOS in the twelve months before the claim.
      </p>

      <h2>9. Ending an account</h2>
      <p>
        You can stop using DanceOS at any time and ask for your account to be deleted from Settings. DanceOS may suspend or end an account that breaks these terms, and will say why. Bookings already paid for are handled under section 3.
      </p>

      <h2>10. Changes, law and contact</h2>
      <ul>
        <li>These terms may change as DanceOS does. The date at the top says when they last did, and a change that matters to you will be announced in the app before it applies.</li>
        <li>These terms are governed by the laws of India. Courts in India have jurisdiction.</li>
        <li>Questions, complaints and notices: Settings → Help &amp; support → Message DanceOS, from any account.</li>
      </ul>

      <h2>A note on this document</h2>
      <p>
        This is DanceOS&apos;s own plain-language statement of how the service works, written by the team that builds it. It will be reviewed by counsel before public launch; the version you agreed to is the one that was on this page on the date you agreed.
      </p>
    </LegalDoc>
  );
}
