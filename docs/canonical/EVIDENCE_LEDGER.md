# EVIDENCE LEDGER

Canonical record linking claims directly to verifiable execution outputs.
Refer to [`forge/PROOF_LEDGER.md`](file:///home/jay/okx/forge/PROOF_LEDGER.md) for active statuses.

---

## Standards for Admitting Evidence
1. **No manual assertions**: "The code works" or "I verified it" is not evidence.
2. **Executed command required**: Every claim must link to an exact CLI command, transaction hash, or automated test output.
3. **Reproducibility**: Any reviewer or judge running the command locally must achieve identical results.
4. **Negative Controls Required**: A verification must include a negative control showing that improper actions actually fail (e.g., $501 transaction fails under $500 limit).

---

## Verified Evidence Log

*(Entries added upon test completion).*
