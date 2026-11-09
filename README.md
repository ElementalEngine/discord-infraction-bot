# Lady Justice

![Github-Banner](assets/ladyJustice.banner.png)

Records infractions for the Civilization Players League (CPL). Staff record a
tier or flat infraction, change a suspension's days, remove a tier or lift a
suspension; the bot swaps a suspended member's roles for the Suspended role and
gives them back when the suspension ends. core-api keeps the records and the
rules; this bot is the Discord side.

## Commands

| Command | What |
|---|---|
| `/infraction tier <quit, minor, moderate, major, extreme>` | a tier infraction: a warning, a suspension, or at the ban threshold a hold until staff act |
| `/infraction tier lagger` | a lagger report: three tag the member (the Lagger role on, the Host role off), with no suspension and no decay |
| `/infraction flat <smurf, oversub, comp>` | a flat suspension |
| `/admin unsuspend`, `/admin modify-days`, `/admin remove-tier` | lift, lengthen or shorten, or remove a tier or a lagger strike; below three strikes the tag comes off |
| `/lookup [member]` | a member's record and strikes; without a member, everyone with a strike |

All three are for staff (the moderator and backend roles) in the suspended channel,
`/lookup` in the bot-commands channel too, hidden from everyone else until an admin grants them in Integrations. Access is
one table, `src/config/access.ts`; startup logs where Integrations differ from it.
Answers to staff are private; every outcome is posted in the suspended channel.

## Suspensions

- A member not in the server is suspended when they join, and so is one who
  leaves and rejoins while suspended; a tagged lagger who rejoins is tagged again.
  Joins come through the join event, which needs the Server Members intent. At
  startup the bot also checks every serving member, so one who came back while
  it was down is suspended then; a Suspended role removed by hand is put back
  only at that check, so staff lift a suspension with `/unsuspend`.
- Suspensions end on their own: the bot asks core-api what is due and when the
  next one ends, and checks at least once a minute. Nothing is kept in memory.
- At startup the bot checks the channels, every role it moves, that those roles
  are below its own, and Manage Roles, and stops with the reason if any is wrong.

## core-api

The bot calls `/api/v2/infractions/*` on its own service token. The types in
`src/api/contract.ts` are generated from `contracts/openapi.json`, core-api's
spec, vendored with `npm run vendor:contracts` (see `contracts/PROVENANCE`).

## Scripts

- `npm run dev`: run from source
- `npm run build`, `npm start`: build to `dist/` and run it
- `npm run verify`: typecheck, lint, tests, version pins, build, contracts

Commands are set on Discord each time the bot starts.
