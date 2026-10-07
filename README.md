# PlayZone

Virtual-coin games (14) with simple username + password login and an admin panel. Zero dependencies, Node 18+.

## Run
    cp .env.example .env     # then edit the values
    node server.js           # open http://localhost:3000

## Login
- Players: Sign up with a username and password (6+ characters), then Login.
- Admin: Login with ADMIN_USER and ADMIN_PASSWORD on the same form. The admin can play every game and
  presses the "Admin Panel" button at the top to open the panel.

## Admin panel
Overview, Users (search, edit username/phone/email/coins, view or change password, ban, delete),
Recharges, Games (on/off, max bet, win chance 1-100%), Settings (announcement, house edge, signup/daily coins,
background image upload with dimming slider).

## Data
Everything is stored in DATA_DIR/db.json (the background image in DATA_DIR/bg.bin). On Render, attach a persistent disk and point DATA_DIR to it,
otherwise data resets on each deploy. Coins have no cash value.


## Virtual wallet/admin features
- User wallet with virtual-coin recharge requests and image proof upload.
- Admin-uploaded recharge instruction image shown in the user wallet.
- Admin recharge/adjustment for any user.
- Virtual-coin withdrawal requests with admin approve/reject + refund.
- Per-user profit multiplier from 0.1x to 5x; only winning payouts are scaled.
- User account deletion requires password verification. Logout requires confirmation.
- Admin database/storage usage, bet-history deletion, and 30-day cleanup tools.
- Approved/rejected recharge proof images are removed from the JSON database after resolution.
- All coins are virtual and have no cash value.
