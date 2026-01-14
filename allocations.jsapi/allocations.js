// /pages/api/allocations.js  （Next.js）
// 或 /api/allocations.js      （Vercel Functions + ESM）

export default async function handler(req, res) {
  // CORS（同域不需要，但留着更稳；也方便你未来从别的域调这个 proxy）
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  try {
    // 兼容 identity / address 两种参数名
    const q = req.query || {};
    const identityRaw = String((q.identity ?? q.address ?? "")).trim();
    let identityType = String((q.identityType ?? q.type ?? "")).trim();

    // 允许不传 identityType 时自动推断（可选）
    // 0x... => evm_wallet
    // Base58(32~44) => svm_wallet
    const ETH_RE = /^0x[a-fA-F0-9]{40}$/;
    const SVM_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

    if (!identityRaw) {
      return res.status(400).json({ error: "Missing identity/address" });
    }

    if (!identityType) {
      if (ETH_RE.test(identityRaw)) identityType = "evm_wallet";
      else if (SVM_RE.test(identityRaw)) identityType = "svm_wallet";
      else {
        return res.status(400).json({
          error: "Missing identityType and cannot infer type",
          hint: "Pass identityType=evm_wallet or svm_wallet",
        });
      }
    }

    if (!["evm_wallet", "svm_wallet"].includes(identityType)) {
      return res.status(400).json({
        error: "Invalid identityType",
        allowed: ["evm_wallet", "svm_wallet"],
      });
    }

    // 关键：EVM 地址强制小写（你要求的）
    const identity =
      identityType === "evm_wallet"
        ? identityRaw.toLowerCase()
        : identityRaw;

    // 再做一次格式校验（避免乱传）
    if (identityType === "evm_wallet" && !ETH_RE.test(identity)) {
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
        "accept": "application/json",
        "user-agent": "Mozilla/5.0 Fogo-Allocations-Proxy",
      },
    });

    const text = await resp.text();

    res.setHeader(
      "Content-Type",
      resp.headers.get("content-type") || "application/json; charset=utf-8"
    );

    // 缓存 30 秒，防止频繁刷接口（可自行调大/调小/或 no-store）
    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60");

    return res.status(resp.status).send(text);
  } catch (e) {
    return res.status(500).json({
      error: "Proxy error",
      detail: String(e?.message || e),
    });
  }
}
