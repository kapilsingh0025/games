# PlayZone — Ludo/Admin fix

This build fixes the Ludo and admin issues from the previous build.

## Ludo
- Real visual 15x15 Ludo-style board with four colored home areas and center.
- Four player token sets are visible on the board.
- Legal tokens pulse/can be clicked after a valid dice roll.
- Large playable dice button shows the rolled value and whose turn it is.
- Player/turn chips show all players.
- Random 2/3/4-player matchmaking.
- Friend username invite flow with accept/decline.
- Friend already in another Ludo match is rejected cleanly.
- Existing Ludo match/invite is restored when opening Ludo.
- Live state and chat continue through SSE.

## Admin
- Restored admin action routing and server-side handlers.
- User, balance, game, settings, withdrawal and reset actions work through the admin API.

## Validation
- `node --check server.js` passes.
- All client script blocks pass `node --check`.
- Local API flow tested: signup -> friend invite -> invite state -> accept -> match state.
