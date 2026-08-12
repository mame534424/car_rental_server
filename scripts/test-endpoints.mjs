/**
 * End-to-end endpoint test harness for Lumen Car Rental backend.
 *
 * Runs against a LIVE server (default http://localhost:4000) and a real
 * Supabase test DB + Storage bucket. Manages httpOnly auth cookies manually.
 *
 * Usage:  node scripts/test-endpoints.mjs
 * Exit code is non-zero if any assertion fails.
 */

const BASE = process.env.TEST_BASE_URL || "http://localhost:4000";
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || "admin@lumen.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || "admin123";
const RUN = `t${Date.now().toString(36)}`; // unique per run to avoid collisions

// ---- tiny cookie jar -------------------------------------------------------
const jar = {};
function storeCookies(res) {
  const list = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const sc of list) {
    const first = sc.split(";")[0];
    const eq = first.indexOf("=");
    const name = first.slice(0, eq).trim();
    const val = first.slice(eq + 1).trim();
    if (val === "") delete jar[name];
    else jar[name] = val;
  }
}
function cookieHeader() {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

// ---- request helper --------------------------------------------------------
async function api(method, path, opts = {}) {
  const headers = {};
  if (opts.auth) {
    const c = cookieHeader();
    if (c) headers.Cookie = c;
  }
  let body;
  if (opts.form) {
    body = opts.form; // FormData — let fetch set the multipart boundary
  } else if (opts.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.json);
  }
  const res = await fetch(BASE + path, { method, headers, body, redirect: "manual" });
  storeCookies(res);
  const ct = res.headers.get("content-type") || "";
  let payload;
  if (ct.includes("application/json")) payload = await res.json();
  else payload = await res.text();
  return { status: res.status, body: payload, res };
}

// ---- assertions ------------------------------------------------------------
let passed = 0;
const failures = [];
function ok(name, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push({ name, detail });
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
function short(body) {
  const s = typeof body === "string" ? body : JSON.stringify(body);
  return s.length > 180 ? s.slice(0, 180) + "…" : s;
}
// status assertion that prints body on mismatch
function okStatus(name, r, expected) {
  ok(name, r.status === expected, `expected ${expected}, got ${r.status}: ${short(r.body)}`);
}

// ISO helper
const iso = (d) => new Date(d).toISOString();
const DAY = 86400000;

// state shared across tests
const state = {};

async function section(title, fn) {
  console.log(`\n── ${title}`);
  await fn();
}

async function main() {
  console.log(`Testing ${BASE}  (run id ${RUN})`);

  // ==== HEALTH ==============================================================
  await section("Health", async () => {
    const r = await api("GET", "/health");
    okStatus("GET /health -> 200", r, 200);
    ok("health payload", r.body?.success === true);
  });

  // ==== AUTH ================================================================
  await section("Auth", async () => {
    let r = await api("POST", "/api/auth/login", {
      json: { email: ADMIN_EMAIL, password: "wrong-password" },
    });
    okStatus("login wrong password -> 401", r, 401);

    r = await api("POST", "/api/auth/login", { json: { email: "not-an-email", password: "x" } });
    okStatus("login invalid email (zod) -> 400", r, 400);

    r = await api("POST", "/api/auth/login", { json: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
    okStatus("login valid -> 200", r, 200);
    ok("login returns admin email", r.body?.data?.admin?.email === ADMIN_EMAIL);
    ok("accessToken cookie set", Boolean(jar.accessToken), "no accessToken cookie");
    ok("refreshToken cookie set", Boolean(jar.refreshToken), "no refreshToken cookie");

    r = await api("GET", "/api/auth/me", { auth: false });
    okStatus("GET /me without cookie -> 401", r, 401);

    r = await api("GET", "/api/auth/me", { auth: true });
    okStatus("GET /me with cookie -> 200", r, 200);
    ok("/me returns admin", r.body?.data?.email === ADMIN_EMAIL);

    const beforeAccess = jar.accessToken;
    r = await api("POST", "/api/auth/refresh", { auth: true });
    okStatus("POST /refresh -> 200", r, 200);
    ok("refresh rotates access token", jar.accessToken && jar.accessToken !== beforeAccess);

    // refreshed access token still authorizes
    r = await api("GET", "/api/auth/me", { auth: true });
    okStatus("/me after refresh -> 200", r, 200);
  });

  // ==== ADMIN CAR CRUD ======================================================
  await section("Admin car CRUD + validation", async () => {
    let r = await api("POST", "/api/admin/cars", {
      auth: false,
      json: { brand: "X", model: "Y", quantity: 1, pricePerDay: 10 },
    });
    okStatus("create car unauthenticated -> 401", r, 401);

    r = await api("POST", "/api/admin/cars", { auth: true, json: { model: "NoBrand", quantity: 1, pricePerDay: 10 } });
    okStatus("create car missing brand (zod) -> 400", r, 400);
    ok("validation details present", Boolean(r.body?.details?.brand));

    // quantity 1 car — used for double-booking test
    r = await api("POST", "/api/admin/cars", {
      auth: true,
      json: { brand: `Toyota-${RUN}`, model: "Yaris", quantity: 1, pricePerDay: 1000 },
    });
    okStatus("create car qty1 -> 201", r, 201);
    ok("car has numeric quantity (coercion)", r.body?.data?.quantity === 1);
    state.carQty1 = r.body?.data?.id;

    // quantity 2 car
    r = await api("POST", "/api/admin/cars", {
      auth: true,
      json: { brand: `Honda-${RUN}`, model: "Civic", quantity: 2, pricePerDay: 1500 },
    });
    okStatus("create car qty2 -> 201", r, 201);
    state.carQty2 = r.body?.data?.id;

    // high capacity car for manual/today tests
    r = await api("POST", "/api/admin/cars", {
      auth: true,
      json: { brand: `Fleet-${RUN}`, model: "Van", quantity: 5, pricePerDay: 2000 },
    });
    okStatus("create fleet car qty5 -> 201", r, 201);
    state.carFleet = r.body?.data?.id;

    r = await api("PATCH", `/api/admin/cars/${state.carQty1}`, { auth: true, json: { pricePerDay: 1200 } });
    okStatus("PATCH car price -> 200", r, 200);
    ok("price updated", Number(r.body?.data?.pricePerDay) === 1200);

    r = await api("GET", "/api/admin/cars", { auth: true });
    okStatus("GET /admin/cars -> 200", r, 200);
    ok("admin car list is array", Array.isArray(r.body?.data));
  });

  // ==== PUBLIC CAR LISTING + AVAILABILITY ===================================
  await section("Public car listing + availability", async () => {
    let r = await api("GET", "/api/cars");
    okStatus("GET /api/cars (public) -> 200", r, 200);
    ok("public list is array", Array.isArray(r.body?.data));

    r = await api("GET", `/api/cars/${state.carQty1}`);
    okStatus("GET /api/cars/:id -> 200", r, 200);

    r = await api("GET", "/api/cars/not-a-uuid");
    okStatus("GET /api/cars/:id bad uuid -> 400", r, 400);

    r = await api("GET", `/api/cars/${crypto.randomUUID()}`);
    okStatus("GET /api/cars/:id missing -> 404", r, 404);

    // availability window used for the booking below (single base timestamp so
    // the pickup→return span is exactly 2 days, not 2 days + a sub-ms fraction)
    const winBase = Date.now();
    state.win = { pickup: iso(winBase + 10 * DAY), ret: iso(winBase + 12 * DAY) };
    r = await api("GET", `/api/cars?pickupDate=${encodeURIComponent(state.win.pickup)}&returnDate=${encodeURIComponent(state.win.ret)}`);
    okStatus("availability query -> 200", r, 200);
    const q1 = r.body?.data?.find((c) => c.id === state.carQty1);
    ok("qty1 car available before booking", q1 && q1.availableUnits === 1, `availableUnits=${q1?.availableUnits}`);
    ok("availableUnits field present", q1 && typeof q1.availableUnits === "number");

    r = await api("GET", "/api/cars?pickupDate=not-a-date&returnDate=also-bad");
    okStatus("availability invalid dates (zod) -> 400", r, 400);
  });

  // ==== PUBLIC BOOKING (multipart + Supabase upload) ========================
  await section("Public booking creation (multipart + ID upload)", async () => {
    const png = Buffer.from(
      "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea735d6b40000000049454e44ae426082",
      "hex"
    );
    function bookingForm(overrides = {}) {
      const fd = new FormData();
      const fields = {
        carId: state.carQty1,
        pickupLocation: "Bole Airport",
        returnLocation: "Bole Airport",
        pickupDate: state.win.pickup,
        returnDate: state.win.ret,
        customerName: "Abebe Kebede",
        customerPhone: "+251911223344",
        customerEmail: `abebe-${RUN}@example.com`,
        identificationType: "NATIONAL_ID",
        identificationNumber: `${RUN}-ID-001`,
        ...overrides,
      };
      for (const [k, v] of Object.entries(fields)) if (v !== undefined) fd.set(k, v);
      return fd;
    }

    // missing carId -> validation 400
    let fd = bookingForm({ carId: undefined });
    fd.set("identificationDocument", new Blob([png], { type: "image/png" }), "id.png");
    let r = await api("POST", "/api/bookings", { form: fd });
    okStatus("booking missing carId (zod) -> 400", r, 400);

    // returnDate <= pickupDate -> refine 400
    fd = bookingForm({ pickupDate: state.win.ret, returnDate: state.win.pickup });
    fd.set("identificationDocument", new Blob([png], { type: "image/png" }), "id.png");
    r = await api("POST", "/api/bookings", { form: fd });
    okStatus("booking returnDate<=pickupDate -> 400", r, 400);

    // bad file type -> multer fileFilter 400
    fd = bookingForm();
    fd.set("identificationDocument", new Blob([Buffer.from("hello")], { type: "text/plain" }), "note.txt");
    r = await api("POST", "/api/bookings", { form: fd });
    okStatus("booking bad file type -> 400", r, 400);

    // happy path with real upload
    fd = bookingForm();
    fd.set("identificationDocument", new Blob([png], { type: "image/png" }), "id.png");
    r = await api("POST", "/api/bookings", { form: fd });
    okStatus("booking create (with upload) -> 201", r, 201);
    ok("booking status PENDING_PAYMENT", r.body?.data?.bookingStatus === "PENDING_PAYMENT");
    ok("ID document uploaded (path stored)", Boolean(r.body?.data?.customer?.identificationDocumentPath), "no doc path -> Supabase upload failed");
    ok("total = 2 days * 1200", Number(r.body?.data?.totalAmount) === 2400, `total=${r.body?.data?.totalAmount}`);
    state.booking1 = r.body?.data?.id;

    // double-booking a fully-reserved (qty1) car for the same window -> 409
    fd = bookingForm({ identificationNumber: `${RUN}-ID-002`, customerName: "Second Person" });
    fd.set("identificationDocument", new Blob([png], { type: "image/png" }), "id.png");
    r = await api("POST", "/api/bookings", { form: fd });
    okStatus("double-book fully-reserved car -> 409", r, 409);

    // availability now reflects the reservation
    r = await api("GET", `/api/cars?pickupDate=${encodeURIComponent(state.win.pickup)}&returnDate=${encodeURIComponent(state.win.ret)}`);
    const stillThere = r.body?.data?.find((c) => c.id === state.carQty1);
    ok("qty1 car filtered out after booking", !stillThere, "car still shows as available");
  });

  // ==== PAYMENT FLOW (Chapa-shaped mock) ====================================
  await section("Payment checkout + verify", async () => {
    let r = await api("POST", "/api/payments/checkout", { json: { bookingId: crypto.randomUUID() } });
    okStatus("checkout unknown booking -> 404", r, 404);

    r = await api("POST", "/api/payments/checkout", { json: { bookingId: "nope" } });
    okStatus("checkout invalid bookingId (zod) -> 400", r, 400);

    r = await api("POST", "/api/payments/checkout", { json: { bookingId: state.booking1 } });
    okStatus("checkout -> 200", r, 200);
    ok("checkoutUrl returned", typeof r.body?.data?.checkoutUrl === "string");
    ok("transactionReference returned", typeof r.body?.data?.transactionReference === "string");
    state.txRef = r.body?.data?.transactionReference;

    r = await api("GET", `/api/payments/mock-checkout/${state.txRef}`);
    okStatus("mock checkout page -> 200", r, 200);
    ok("mock page is HTML", typeof r.body === "string" && r.body.includes("Mock Chapa"));

    r = await api("POST", `/api/payments/verify/${state.txRef}`);
    okStatus("verify -> 200", r, 200);
    ok("payment now PAID", r.body?.data?.status === "PAID");

    // booking moved to PENDING_VERIFICATION + signed URL available
    r = await api("GET", `/api/admin/bookings/${state.booking1}`, { auth: true });
    okStatus("get booking after verify -> 200", r, 200);
    ok("booking now PENDING_VERIFICATION", r.body?.data?.bookingStatus === "PENDING_VERIFICATION");
    ok("booking paymentStatus PAID", r.body?.data?.paymentStatus === "PAID");
    ok("signed URL for ID document present", typeof r.body?.data?.documentSignedUrl === "string" && r.body.data.documentSignedUrl.startsWith("http"), "no signed URL");

    // idempotent re-verify
    r = await api("POST", `/api/payments/verify/${state.txRef}`);
    okStatus("re-verify already-paid -> 200", r, 200);
    ok("re-verify message idempotent", /already/i.test(r.body?.message || ""));

    // verify unknown ref
    r = await api("POST", `/api/payments/verify/does-not-exist-${RUN}`);
    okStatus("verify unknown ref -> 404", r, 404);

    // checkout on a booking no longer awaiting payment -> 409
    r = await api("POST", "/api/payments/checkout", { json: { bookingId: state.booking1 } });
    okStatus("checkout on non-PENDING_PAYMENT booking -> 409", r, 409);
  });

  // ==== STATUS MACHINE ======================================================
  await section("Booking status machine", async () => {
    // helper to make a fresh online booking in PENDING_PAYMENT on the fleet car
    async function freshBooking(idn) {
      const fd = new FormData();
      const fields = {
        carId: state.carFleet,
        pickupLocation: "A",
        returnLocation: "B",
        pickupDate: iso(Date.now() + 20 * DAY),
        returnDate: iso(Date.now() + 22 * DAY),
        customerName: "Machine Test",
        customerPhone: "+251900000000",
        identificationType: "PASSPORT",
        identificationNumber: idn,
      };
      for (const [k, v] of Object.entries(fields)) fd.set(k, v);
      const r = await api("POST", "/api/bookings", { form: fd });
      return r.body?.data?.id;
    }

    // approve a PENDING_PAYMENT booking -> 400 (must be PENDING_VERIFICATION)
    const bPending = await freshBooking(`${RUN}-SM-1`);
    let r = await api("PATCH", `/api/admin/bookings/${bPending}/approve`, { auth: true });
    okStatus("approve PENDING_PAYMENT booking -> 400", r, 400);

    // approve booking1 (PENDING_VERIFICATION) -> CONFIRMED
    r = await api("PATCH", `/api/admin/bookings/${state.booking1}/approve`, { auth: true });
    okStatus("approve PENDING_VERIFICATION -> 200", r, 200);
    ok("booking now CONFIRMED", r.body?.data?.bookingStatus === "CONFIRMED");

    // complete a non-confirmed booking -> 400
    r = await api("PATCH", `/api/admin/bookings/${bPending}/complete`, { auth: true });
    okStatus("complete non-CONFIRMED -> 400", r, 400);

    // complete booking1 (CONFIRMED) -> COMPLETED
    r = await api("PATCH", `/api/admin/bookings/${state.booking1}/complete`, { auth: true });
    okStatus("complete CONFIRMED -> 200", r, 200);
    ok("booking now COMPLETED", r.body?.data?.bookingStatus === "COMPLETED");

    // complete again -> 400 (terminal)
    r = await api("PATCH", `/api/admin/bookings/${state.booking1}/complete`, { auth: true });
    okStatus("complete COMPLETED again -> 400", r, 400);

    // reject flow
    const bReject = await freshBooking(`${RUN}-SM-2`);
    r = await api("PATCH", `/api/admin/bookings/${bReject}/reject`, { auth: true, json: { reason: "bad docs" } });
    okStatus("reject PENDING_PAYMENT -> 200", r, 200);
    ok("booking now REJECTED", r.body?.data?.bookingStatus === "REJECTED");
    r = await api("PATCH", `/api/admin/bookings/${bReject}/reject`, { auth: true, json: {} });
    okStatus("reject already-REJECTED -> 400", r, 400);

    // cancel flow
    const bCancel = await freshBooking(`${RUN}-SM-3`);
    r = await api("PATCH", `/api/admin/bookings/${bCancel}/cancel`, { auth: true });
    okStatus("cancel PENDING_PAYMENT -> 200", r, 200);
    ok("booking now CANCELLED", r.body?.data?.bookingStatus === "CANCELLED");
    r = await api("PATCH", `/api/admin/bookings/${bCancel}/cancel`, { auth: true });
    okStatus("cancel already-CANCELLED -> 400", r, 400);

    // unknown id -> 404
    r = await api("PATCH", `/api/admin/bookings/${crypto.randomUUID()}/approve`, { auth: true });
    okStatus("approve unknown booking -> 404", r, 404);
  });

  // ==== CAPACITY RELEASE ON CANCEL ==========================================
  await section("Capacity release on cancel/reject", async () => {
    // dedicated qty1 car + window
    let r = await api("POST", "/api/admin/cars", {
      auth: true,
      json: { brand: `Cap-${RUN}`, model: "Solo", quantity: 1, pricePerDay: 500 },
    });
    const capCar = r.body?.data?.id;
    const win = { pickup: iso(Date.now() + 40 * DAY), ret: iso(Date.now() + 42 * DAY) };

    function form(idn) {
      const fd = new FormData();
      const fields = {
        carId: capCar,
        pickupLocation: "A",
        returnLocation: "B",
        pickupDate: win.pickup,
        returnDate: win.ret,
        customerName: "Cap Test",
        customerPhone: "+251900000001",
        identificationType: "OTHER",
        identificationNumber: idn,
      };
      for (const [k, v] of Object.entries(fields)) fd.set(k, v);
      return fd;
    }

    r = await api("POST", "/api/bookings", { form: form(`${RUN}-CAP-A`) });
    okStatus("capacity: first booking -> 201", r, 201);
    const bookingA = r.body?.data?.id;

    r = await api("POST", "/api/bookings", { form: form(`${RUN}-CAP-B`) });
    okStatus("capacity: second booking blocked -> 409", r, 409);

    // cancel A releases the unit
    r = await api("PATCH", `/api/admin/bookings/${bookingA}/cancel`, { auth: true });
    okStatus("capacity: cancel first -> 200", r, 200);

    r = await api("POST", "/api/bookings", { form: form(`${RUN}-CAP-B`) });
    okStatus("capacity: second booking now allowed -> 201", r, 201);
    ok("cancelled booking released capacity", r.status === 201);
  });

  // ==== MANUAL / WALK-IN BOOKING ============================================
  await section("Manual booking", async () => {
    let r = await api("POST", "/api/admin/bookings/manual", {
      auth: false,
      json: {},
    });
    okStatus("manual booking unauthenticated -> 401", r, 401);

    r = await api("POST", "/api/admin/bookings/manual", {
      auth: true,
      json: {
        carId: state.carFleet,
        pickupLocation: "Office",
        returnLocation: "Office",
        pickupDate: iso(Date.now() + 3 * DAY),
        returnDate: iso(Date.now() + 5 * DAY),
        customerName: "Walk In",
        customerPhone: "+251933445566",
        identificationType: "DRIVERS_LICENSE",
        identificationNumber: `${RUN}-MAN-1`,
        // paymentStatus omitted -> defaults to PAID
      },
    });
    okStatus("manual booking (default PAID) -> 201", r, 201);
    ok("manual booking CONFIRMED", r.body?.data?.bookingStatus === "CONFIRMED");
    ok("manual booking PAID", r.body?.data?.paymentStatus === "PAID");
    ok("manual booking source MANUAL", r.body?.data?.source === "MANUAL");

    // manual booking with invalid body -> 400
    r = await api("POST", "/api/admin/bookings/manual", { auth: true, json: { carId: state.carFleet } });
    okStatus("manual booking missing fields (zod) -> 400", r, 400);
  });

  // ==== TODAY'S RENTALS (Africa/Addis_Ababa bucketing) ======================
  await section("Today's rentals (Addis Ababa UTC+3)", async () => {
    // Compute today's calendar date in Addis (UTC+3)
    const addisNow = new Date(Date.now() + 3 * 3600 * 1000);
    const y = addisNow.getUTCFullYear();
    const m = addisNow.getUTCMonth();
    const d = addisNow.getUTCDate();
    // pickup today at 09:00 Addis -> UTC instant
    const pickupToday = new Date(Date.UTC(y, m, d, 9, 0, 0) - 3 * 3600 * 1000);
    const returnLater = new Date(pickupToday.getTime() + 3 * DAY);
    // a return that lands today at 16:00 Addis
    const returnToday = new Date(Date.UTC(y, m, d, 16, 0, 0) - 3 * 3600 * 1000);
    const pickupEarlier = new Date(returnToday.getTime() - 3 * DAY);
    // a booking far in the future (must NOT appear today)
    const futurePickup = new Date(Date.UTC(y, m, d, 9, 0, 0) - 3 * 3600 * 1000 + 30 * DAY);

    async function manual(pickup, ret, idn) {
      const r = await api("POST", "/api/admin/bookings/manual", {
        auth: true,
        json: {
          carId: state.carFleet,
          pickupLocation: "P",
          returnLocation: "R",
          pickupDate: iso(pickup),
          returnDate: iso(ret),
          customerName: "Today Test",
          customerPhone: "+251900111222",
          identificationType: "FAYDA",
          identificationNumber: idn,
          paymentStatus: "PAID",
        },
      });
      return r.body?.data?.id;
    }

    const pickupBooking = await manual(pickupToday, returnLater, `${RUN}-TD-P`);
    const returnBooking = await manual(pickupEarlier, returnToday, `${RUN}-TD-R`);
    const futureBooking = await manual(futurePickup, new Date(futurePickup.getTime() + DAY), `${RUN}-TD-F`);

    const r = await api("GET", "/api/admin/bookings/today", { auth: true });
    okStatus("GET /admin/bookings/today -> 200", r, 200);
    const pickupIds = (r.body?.data?.pickups || []).map((b) => b.id);
    const returnIds = (r.body?.data?.returns || []).map((b) => b.id);
    ok("today's pickups include today-pickup booking", pickupIds.includes(pickupBooking));
    ok("today's returns include today-return booking", returnIds.includes(returnBooking));
    ok("future booking not in today's pickups", !pickupIds.includes(futureBooking));
  });

  // ==== ADMIN BOOKING LISTING + FILTER ======================================
  await section("Admin booking listing + filter", async () => {
    let r = await api("GET", "/api/admin/bookings", { auth: true });
    okStatus("GET /admin/bookings -> 200", r, 200);
    ok("bookings list is array", Array.isArray(r.body?.data));

    r = await api("GET", "/api/admin/bookings?status=CONFIRMED", { auth: true });
    okStatus("filter status=CONFIRMED -> 200", r, 200);
    ok("all filtered are CONFIRMED", (r.body?.data || []).every((b) => b.bookingStatus === "CONFIRMED"));

    r = await api("GET", "/api/admin/bookings", { auth: false });
    okStatus("list bookings unauthenticated -> 401", r, 401);

    // invalid status must be rejected with 400, not crash the route with 500
    r = await api("GET", "/api/admin/bookings?status=NOT_A_STATUS", { auth: true });
    okStatus("filter invalid status -> 400 (not 500)", r, 400);
  });

  // ==== DELETE CAR GUARD ====================================================
  await section("Delete car guard", async () => {
    // car with active bookings cannot be deleted
    let r = await api("DELETE", `/api/admin/cars/${state.carFleet}`, { auth: true });
    okStatus("delete car with active bookings -> 409", r, 409);

    // create a throwaway car with no bookings, delete it
    r = await api("POST", "/api/admin/cars", { auth: true, json: { brand: `Del-${RUN}`, model: "Tmp", quantity: 1, pricePerDay: 100 } });
    const delId = r.body?.data?.id;
    r = await api("DELETE", `/api/admin/cars/${delId}`, { auth: true });
    okStatus("delete car without bookings -> 200", r, 200);

    r = await api("DELETE", `/api/admin/cars/${delId}`, { auth: true });
    okStatus("delete already-deleted car -> 404", r, 404);
  });

  // ==== LOGOUT ==============================================================
  await section("Logout", async () => {
    let r = await api("POST", "/api/auth/logout", { auth: true });
    okStatus("logout -> 200", r, 200);
    ok("cookies cleared", !jar.accessToken && !jar.refreshToken, "cookies still present");

    r = await api("GET", "/api/auth/me", { auth: true });
    okStatus("/me after logout -> 401", r, 401);

    r = await api("POST", "/api/auth/refresh", { auth: true });
    okStatus("/refresh after logout -> 401", r, 401);
  });

  // ==== SUMMARY =============================================================
  console.log(`\n── Summary`);
  console.log(`  passed: ${passed}`);
  console.log(`  failed: ${failures.length}`);
  if (failures.length) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  ✗ ${f.name}${f.detail ? ` — ${f.detail}` : ""}`);
    process.exit(1);
  }
  console.log("\nAll endpoint tests passed.");
}

main().catch((e) => {
  console.error("Harness crashed:", e);
  process.exit(2);
});
