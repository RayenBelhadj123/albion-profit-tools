# Compliance And Private Data

Albion Transport should stay on the low-risk side of data collection.

## Safe data sources for this project

Use:

- Albion Online Data public REST API
- local item and recipe metadata
- manual private price entry
- CSV imports created by the user
- completed transport and crafting records entered by the user
- public files published by community projects for item identifiers and metadata

## What this project should not build

Do not build a private Albion network sniffer, packet parser, memory reader,
input automation tool, bot, or client modifier.

The official Albion Online Data client and some community clients monitor
network traffic and upload market data, but copying that behavior into this app
for private-only collection creates unnecessary account-risk and maintenance
risk. This project should not intercept, modify, automate, or reverse engineer
Albion Online client traffic.

## Private data policy

Private data means data the user enters or imports into this application. It
should not be sent to Albion Online Data, third-party APIs, or public endpoints.

Private observations can include:

- observed price
- available quantity
- city
- quality
- order type
- timestamp
- expiry
- note

Every private override must be visible in the UI and API responses.

## User isolation

Each player account has its own opaque database session and all private records
must be queried through the authenticated user id. Passwords are stored only as
salted scrypt hashes. Session tokens are stored in HttpOnly, SameSite cookies;
only their SHA-256 hashes are persisted in the database. Public market and
calculator endpoints may remain shared, but private observations, profiles,
plans, settings, and completed activity must never use a global fallback user.

## Practical rule

If data can be collected without touching the running Albion game client, that
is the preferred path. If a feature requires monitoring game traffic, reading
game memory, automating inputs, or modifying the game client, do not implement
it in this project.
