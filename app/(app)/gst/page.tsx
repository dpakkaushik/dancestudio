import { redirect } from "next/navigation";

/** `/gst` IS AN ADDRESS NOW, NOT A SCREEN (26 Sep 2026).
 *
 *  It was the organization LOGIN's one-time GST errand. That login is retired —
 *  an organization is a business a person opens — so the number lives on the
 *  business row and its screen is `/business/{id}/gst`, reached from that
 *  organization's own Settings. Somebody standing on the old address is sent to
 *  the hub that lists their organizations, which is the one place from which
 *  every one of those screens is one press away.
 *
 *  ⚠ THE ROUTE STAYS (Rule 14): the installed TWA reopens on the last URL it
 *  showed, and a bare 404 with no address bar reads as a broken build. */
export default function GstAddress() {
  redirect("/organizations");
}
