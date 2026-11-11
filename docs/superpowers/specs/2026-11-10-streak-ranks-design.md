# Streak ranks and the winner's banner

Date: 2026-11-10 · Status: draft for JP's review
Mockup: `2026-11-10-streak-ranks-mockup.html`, next to this file (also at https://claude.ai/artifact/6SiTPb6UWDXj5cumvQVMg9). It is the visual reference for the crests, frames, banner and rank-up moment. Lift its SVG crest artwork; don't redraw it.

## Why

The streak star changes at 3/7/14/30/100 days, but each step is just a slightly different yellow. It doesn't feel like achievement, premium or fun. JP wants climbing a streak to feel like climbing a League rank: metal tiers you can see from across the room, a rank-up that feels like an event, and a loss that hurts. The board is also visually muted. The only thing that should move is something that feels alive, like a banner in the wind.

## What it is

### 1. Ranks replace the star

| Rank | Streak | Crest (each adds to the one before) |
|---|---|---|
| none | 0–2 days | no crest; plain row, as today |
| Bronze | 3+ | shield with laurels |
| Silver | 7+ | + side blades |
| Gold | 14+ | + wings, a crown, a red gem |
| Platinum | 30+ | wider wings, teal gem, halo |
| Diamond | 100+ | the shield becomes cut crystal, with faint rays |

Same thresholds as today's `STREAK_TIERS`. The rank follows the streak exactly: it is not a separate stat.

- **Board rows:** the streak column shows the crest, the streak number and the rank name in small caps, e.g. "18 GOLD". The whole row gets a still metal frame in its rank's metal: an outer metal edge, a thin bevel line inside it, and corner pieces that get more ornate with each rank (see mockup). Rows with no rank keep today's look.
- **Elsewhere the star appears** (person panel, player card): show the crest and the rank name in place of the star. No frame there.
- The tooltip keeps today's content ("18 days running. 12 more to reach Platinum.").

**Anti-goals (JP was explicit):**
- Nothing moves over the text. No sweeping sheens, no rotating or swirling borders (the first mockup had these and they were dizzying and hard to read).
- The only idle motion allowed on a row is Diamond's corner gems catching the light now and then. They sit outside the text.
- Any glow is soft. Hot white flashes are hard on the eyes.

### 2. The winner's banner replaces the 👑

Last week's champion (today's `champion`, which shows 👑) gets a banner hanging from the top-left edge of their board row, beside the rank number. It is a swallowtail banner on a gold rod, with a gold crown and "WK 7" (the crew week number) on the cloth. The cloth's tail ripples gently, about a 3.4s loop, while the rod and the crown area stay still. JP called this motion "elite and soft". Don't make it bigger or faster.

- It must never cover the cards number or the streak. JP rejected a planted-flag version because it got in the way.
- **The banner is earned from Silver up, and its colour follows the winner's current rank** (JP's call), so each rank brings a new banner. A champion with no rank or Bronze gets no banner and keeps today's 👑 on the row (my call: they still won, so something has to show it).

| Winner's rank | Banner |
|---|---|
| none / Bronze | no banner, 👑 as today |
| Silver | Royal violet `#5b21b6 → #2e1065` |
| Gold | Midnight `#1e3a8a → #0b1437` |
| Platinum | Emerald `#047857 → #022c22` |
| Diamond | Onyx `#27272a → #09090b` |

  The trim is always gold.
- It keeps every existing champion rule: it waits for the roundup to play and disappears after a tie.
- **Board row only** (my call). The other crown spots stay as they are: the You tab names, the player card's "👑 Champion · week N", the gold avatar, the roundup and the week strip.

### 3. Rank-up: an event, played once

When a person moves up a rank, each crew member sees it once, the person themself included:

1. A moment joins the existing moment pill queue ("🛡 You reached Gold" / "Adam reached Gold"). The tap that plays it also unlocks sound.
2. On the Board, on that person's row, roughly 3.4s in total (timings as in the mockup):
   - the row dims and the old crest shatters into shards of its metal
   - the new crest bursts out large over the row with soft light rays and a ring
   - a dark plate with metal lettering appears above the row: "RANKED UP · GOLD"
   - a line of light runs once around the frame, and the frame becomes the new metal behind it
   - the big crest flies down into its slot and settles
3. A crisp metal **ching**, synthesised like today's chime (no audio file), plays as the new crest lands.

If someone climbs two ranks while you were away, you see only the latest rank-up.

### 4. Losing a streak: the crest crumbles

When a streak breaks, the streak goes to 0 and the rank drops all the way to none. Each crew member sees this once, the same way: a pill moment ("Adam's Gold streak crumbled"), then on the row the crest cracks and crumbles downward like stone, the frame's metal fades out, and the row is left plain. No ching. It should read as a loss without being cruel; it's the counterpart to the rank-up, not a punishment screen.

**The crumble has its own sound** (JP's call): a low, soft stone crack and rumble, synthesised like the ching. It's quieter and darker than the ching, never harsh, and it plays as the crest breaks.

**A one-time sound hint** (JP's call): the first time a rank moment is waiting, the pill carries a small extra line, "🔊 These have sound, turn it up". Playing the moment dismisses it for good, stored per browser in `localStorage` like the existing show-once hints (`HINT_KEY` in `page.tsx`, `DeckLegend`). There's no separate button and no pop-up. It covers the case a tap can't fix: a phone on silent or with the volume down.

**Only a confirmed break crumbles** (my call). The publisher only sends when Anki closes, so a day with no reviews might just not have synced yet. A missed day counts as a break only once that person has synced after the day ended in their own time zone (their `lastPublishAt` is past it). Until then the streak, crest and frame stay as they were, so a late sync never causes a false crumble followed by a "reached Gold" for a rank they never lost.

### 5. Bookkeeping

What each viewer has been shown is per viewer and server-side, like the rest of the competition state: for each person, the rank you last saw them at.
- **First visit, or a new crew member:** record the current ranks silently, so nobody gets a pile of moments.
- **Moments come from comparing ranks only** (my call). A lower rank than you last saw plays a crumble, down to whatever the rank is now, which may be Bronze if they've already climbed back. A higher rank plays a rank-up. If someone broke a streak and climbed back to the same rank while you were away, you see nothing.
- **Before you tap, the rank is held back, like the crown before the roundup** (my call). On the Board, that person's whole streak cell (number, crest and frame) stays as you last saw it until you play the moment, so you never see "0" next to a Gold crest. The person panel and player card show the live rank.
- **Reduced motion:** the pill still says what happened. Tapping swaps the crest and frame straight to the new state, with no shatter or crumble.

### 6. What's new

Add one short, colloquial entry in `web/lib/whatsNew.ts` (one item, a sentence or two).

## Non-goals (parked for later, on the roadmap)

- **Streak shields / saves:** JP's early ideas are 2 free shields each, maybe one earned per ~300 cards, with a shield icon. They would protect a rank from a full drop. Not in this build: for now a broken streak always falls to none.
- **Hall of banners:** your past weekly wins shown as small banners on your player card.
- **Pets or other earned cosmetics.**
- **Sound beyond the ching and the crumble.**

## Left to the builder

- How rank moments slot into the existing `pendingMoments` / `ackPatch` / `silentPatch` flow and the `CompetitionState` shape, and how they order against roundup and pass moments.
- How the mockup's SVG and animation code becomes components (it's throwaway prototype code; the art and timings are what's approved).
- Frame and banner layout on narrow phone screens. The mockup's 520px rules are a starting point, and nothing may overlap the numbers.
- The exact ching and crumble sounds, within "crisp, metal, short, not loud" and "low, soft stone crack" (today's chime peaks at gain 0.11; stay near it).
