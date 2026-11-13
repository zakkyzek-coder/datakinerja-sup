/**
 * Cloudflare Worker bridge for the DataKinerja Google Apps Script API.
 * Deploy this file as a Worker, then set GAS_EXEC_URL and allowed origin.
 */
const GAS_EXEC_URL = "https://script.google.com/macros/s/AKfycbyLHy03i2_G3tjg49W4lMjU4yQKijlyT2SkVPPs2OAGRZ4uDTC00URZj6VG-D10dzEs/exec";
const ALLOWED_ORIGIN = "https://zakkyzek-coder.github.io";

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function jsonResponse(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(origin) }
  });
}

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== "POST") {
      return jsonResponse({ success: false, message: "Gunakan POST." }, 405, origin);
    }
    if (origin && origin !== ALLOWED_ORIGIN) {
      return jsonResponse({ success: false, message: "Origin tidak diizinkan." }, 403, origin);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ success: false, message: "Payload JSON tidak valid." }, 400, origin);
    }

    const allowedMethods = new Set([
      "checkLogin", "logout", "getDataBundle",
      "listUsers", "createBranchUser", "deleteBranchUser"
    ]);
    if (!payload || !allowedMethods.has(payload.method) || !Array.isArray(payload.args)) {
      return jsonResponse({ success: false, message: "Permintaan API tidak valid." }, 400, origin);
    }

    try {
      const upstream = await fetch(GAS_EXEC_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ method: payload.method, args: payload.args }),
        redirect: "follow"
      });
      const text = await upstream.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        return jsonResponse({
          success: false,
          message: "Respons Apps Script bukan JSON. Pastikan patch doPost sudah ditambahkan dan Web App dideploy ulang."
        }, 502, origin);
      }
      return jsonResponse(data, upstream.ok ? 200 : 502, origin);
    } catch (error) {
      return jsonResponse({ success: false, message: "Tidak dapat menghubungi Apps Script: " + (error?.message || "network error") }, 502, origin);
    }
  }
};
