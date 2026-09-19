-- A STUDIO THAT EVER TOOK A SUBSCRIPTION PAYMENT COULD NOT BE DELETED (20 Sep 2026).
-- ⚠ MONEY (Rule 9): this relaxes one CHECK on the payments ledger. Nothing else.
--
-- THE DEFECT, and it is a contradiction inside ONE migration of 10 Sep 2026
-- (20260912140000_paid_plans_per_studio.sql, lines 263-268):
--
--     add column subscription_id uuid references public.subscriptions (id)
--       on delete set null,
--     ...
--     add constraint payments_subject_check check (
--          (kind = 'order'  and order_id is not null and subscription_id is null)
--       or (kind <> 'order' and order_id is null and subscription_id is not null)
--     );
--
-- The foreign key says "when the subscription goes, KEEP the payment and forget
-- which subscription it was" — the spec's own words for it are "a ledger does
-- not forget money". The CHECK says a non-order payment must ALWAYS name a
-- subscription. So the SET NULL can never succeed: the moment a subscription is
-- deleted, the UPDATE it fires on `payments` violates the CHECK and the whole
-- delete is refused with 23514.
--
-- WHAT THAT BROKE, measured rather than guessed:
--   * `delete from businesses where id = …` is refused for any studio whose
--     subscription ever took a payment — the cascade reaches the subscription,
--     the subscription's SET NULL reaches the payment, and the CHECK stops it.
--   * So `e2e/paid-webhook.spec.ts`'s own `finally` has been FAILING SILENTLY on
--     every run since 10 Sep (it never reads the DELETE's status), and its
--     studios piled up: nine "Mandate Proof Studio …" rows on the test-phone
--     account by 20 Sep, which then crossed `why_no_studio`'s 15-studio cap and
--     took out that spec AND nine phone-based proof scripts at their first line.
--     The pile was diagnosed as "runs killed before the finally" — it was not.
--     The finally ran every time and was refused every time.
--   * Reachable from the app only through the admin API today (no screen deletes
--     a business), which is why no user has met it — the same shape as the
--     19 Sep `crew_header_photos` find and the `20260919180000` audit-column one.
--
-- THE FIX: a subscription payment may exist WITHOUT a live subscription, which
-- is the state the SET NULL was always trying to reach. An ORDER payment is
-- untouched — it must still name its order and must still name no subscription.
alter table public.payments drop constraint payments_subject_check;
alter table public.payments add constraint payments_subject_check check (
     (kind = 'order' and order_id is not null and subscription_id is null)
  or (kind <> 'order' and order_id is null)
);

comment on constraint payments_subject_check on public.payments is
  'A payment names what it paid for: an order payment names its order and no subscription; a subscription payment names no order, and names its subscription while that subscription still exists. ⚠ subscription_id is NULLABLE on purpose (20 Sep 2026): the FK is `on delete set null`, so a payment OUTLIVES the subscription it paid for — a ledger does not forget money. The first cut of this CHECK required it, which made every such subscription, and every studio behind one, undeletable.';
