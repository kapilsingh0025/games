# Ludo realtime fix

This build changes Ludo to a free-play mode and focuses on the actual board-game experience.

## Fixed
- No page reload during Ludo play.
- Server-sent realtime state updates for moves, dice, turns, waiting state and chat.
- Automatic realtime stream reconnect after a temporary disconnect.
- In-place Ludo rendering so the whole PlayZone page is not replaced on every game event.
- Proper 52-space loop, home stretch and finish positions.
- Four colored home yards and four tokens per player.
- Six is required to leave home.
- Exact move validation, captures, extra turn on six/capture/home finish, three-sixes turn loss, win detection and turn timeout.
- Direct friend invitation and accept/decline flow.
- Live invite alerts, including while players are on another page, and invite state on stream reconnect.
- Seat-to-color mapping aligned with each start square, colored home lane and finish tile: red (0), green (13), yellow (26), blue (39).
- A 30-second reconnect grace period; players who stay disconnected or leave mid-game are eliminated, and turns continue among active players.
- Automatic inactivity turns and elimination after three consecutive timed-out turns.
- Dice animation and highlighted legal tokens.
- A server-synchronized live turn countdown and a connection indicator that switches to “Reconnecting” during stream recovery.

Ludo uses no coin stake in this build.
