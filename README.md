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
Recharges, Games (on/off, max bet, win chance 1-100%), Database (space used, clean up, delete bet history), Settings (announcement, house edge, signup/daily coins,
background image upload with dimming slider).

## Data
Everything is stored in DATA_DIR/db.json (the background image in DATA_DIR/bg.bin). On Render, attach a persistent disk and point DATA_DIR to it,
otherwise data resets on each deploy. Coins have no cash value.

## Safety prompts
Logout, deleting a player, deleting bet history, cleaning or resetting the database and deleting your own account all ask Yes/No first.
Players can delete their own account from the Account tab after entering their password.

## Risk multiplier
Before each round a player can choose a risk multiplier from 1x to 10x. Wins then happen about that many times less often but pay that many times more, so the long-run payout stays the same.
