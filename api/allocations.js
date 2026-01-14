// /api/allocations.js  (Vercel Functions - CommonJS)

module.exports = async function handler(req, res) {
  // CORS（同域不需要，但留着更稳）
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    const q = req.query || {};
    const identityRaw = String((q.identity ?? q.address ?? "")).trim();
    let identityType = String((q.identityType ?? q.type ?? "")).trim();

    const ETH_RE = /^0x[a-fA-F0-9]{40}$/;
    const SVM_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

    if (!identityRaw) {
      return res.status(400).json({ error: "Missing identity/address" });
    }

    // ✅ identityType 不传就自动识别
    if (!identityType) {
      if (ETH_RE.test(identityRaw)) identityType = "evm_wallet";
      else if (SVM_RE.test(identityRaw)) identityType = "svm_wallet";
      else {
        return res.status(400).json({
          error: "Invalid identity (cannot infer type)",
          hint: "Use EVM 0x... or SVM Base58",
        });
      }
    }

    if (!["evm_wallet", "svm_wallet"].includes(identityType)) {
      return res.status(400).json({
        error: "Invalid identityType",
        allowed: ["evm_wallet", "svm_wallet"],
      });
    }

    // ✅ EVM 强制小写
    const identity =
      identityType === "evm_wallet"
        ? identityRaw.toLowerCase()
        : identityRaw;

    // ✅ 再校验一遍
    if (identityType === "evm_wallet" && !/^0x[a-f0-9]{40}$/.test(identity)) {
      return res.status(400).json({ error: "Invalid EVM address" });
    }
    if (identityType === "svm_wallet" && !SVM_RE.test(identity)) {
      return res.status(400).json({ error: "Invalid SVM address" });
    }

    const upstream =
      `https://claim.fogo.io/api/allocations` +
      `?identity=${encodeURIComponent(identity)}` +
      `&identityType=${encodeURIComponent(identityType)}`;

    const resp = await fetch(upstream, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": "Mozilla/5.0 Fogo-Allocations-Proxy",
      },
    });

    const text = await resp.text();

    res.setHeader(
      "Content-Type",
      resp.headers.get("content-type") || "application/json; charset=utf-8"
    );

    // 缓存 30 秒（可删）
    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60");

    return res.status(resp.status).send(text);
  } catch (e) {
    return res.status(500).json({
      error: "Proxy error",
      detail: String(e?.message || e),
    });
  }
};
