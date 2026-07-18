# Credits System Verification Checklist

Run after API restart (`.\scripts\run-api.ps1` or `docker compose up api`).

## Environment

- `CREDITS_GATE_ENABLED=true` (default; overrides stale `credits_gate` feature flag on startup)
- `DEBUG=false` in production; gate still applies when `credits_gate_enabled` is true

## Manual verification

1. **Zero balance → 402**
   - Set user balance to 0 (Admin grant negative or DB).
   - `POST /api/v1/works/generate/single` → expect `402` with `required` / `balance`.

2. **Task reward updates balance**
   - Complete daily check-in or engagement task.
   - `GET /api/v1/users/me/credits` → balance increases.
   - H5 Profile / Engagement panel shows updated balance.

3. **Generation deducts credits**
   - With balance ≥ cost, start mock generation (`DEV_MOCK_GENERATION=true`).
   - Response includes `credits_balance`; balance decreases by job cost.

4. **Failed / cancelled job refunds**
   - Start generation, cancel via `POST /jobs/{id}/cancel`.
   - Balance restored (refund transaction in ledger).

## Automated tests

```bash
cd backend
CREDITS_GATE_ENABLED=true pytest tests/test_credits_system.py -q
```

CI runs these tests with Postgres + Redis services on every push/PR.
