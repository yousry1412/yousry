-- =====================================================================
--  Smart Umrah ERP — database invariant tests (run after schema.sql)
--  psql -v ON_ERROR_STOP=1 -f db/tests.sql
--  Everything runs in one transaction and is rolled back.
-- =====================================================================
\set QUIET on
SET client_min_messages = notice;
BEGIN;
SET search_path = umrah, public;

CREATE FUNCTION pg_temp.expect_error(p_sql text, p_pattern text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM !~ p_pattern THEN RAISE EXCEPTION 'expected /%/ but got: %', p_pattern, SQLERRM; END IF;
    RAISE NOTICE 'PASS  rejected  %', p_pattern;
    RETURN;
  END;
  RAISE EXCEPTION 'expected /%/ but statement succeeded: %', p_pattern, p_sql;
END $$;
CREATE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT cond THEN RAISE EXCEPTION 'FAIL  %', label; END IF;
  RAISE NOTICE 'PASS  %', label;
END $$;

DO $$
DECLARE
  s_sales bigint; s_head bigint; s_mgr bigint;
  sup_h bigint; sup_h2 bigint; h_mak bigint; h_mad bigint; al_mak bigint; al_mad bigint;
  trip bigint; cc text;
  r_m bigint; r_f bigint; r_priv bigint; r_pool bigint;
  b_man bigint; b_man2 bigint; b_wom bigint; b_fam bigint; b_disc bigint; b_unb bigint; b_ttl bigint;
  p_man bigint; p_man2 bigint; p_wom bigint; p_fa bigint; p_fm bigint; p_chd bigint; p_inf bigint;
  bed_m1 bigint; bed_m2 bigint; bed_f1 bigint; bed_p1 bigint; bed_p2 bigint; bed_p3 bigint;
  ag bigint; ag_over bigint; bus bigint; n int; rec record;
BEGIN
  -- ---------------- master data
  INSERT INTO staff (full_name, role) VALUES ('Sales', 'SALES') RETURNING id INTO s_sales;
  INSERT INTO staff (full_name, role) VALUES ('Head', 'HEAD') RETURNING id INTO s_head;
  INSERT INTO staff (full_name, role) VALUES ('Manager', 'MANAGER') RETURNING id INTO s_mgr;
  INSERT INTO suppliers (name, category, currency) VALUES ('Makkah hotel co', 'HOTEL', 'SAR') RETURNING id INTO sup_h;
  INSERT INTO suppliers (name, category, currency) VALUES ('Madinah hotel co', 'HOTEL', 'SAR') RETURNING id INTO sup_h2;
  INSERT INTO hotels (city, name_ar, name_en, supplier_id) VALUES ('MAK', 'فندق مكة', 'Makkah Hotel', sup_h) RETURNING id INTO h_mak;
  INSERT INTO hotels (city, name_ar, name_en, supplier_id) VALUES ('MAD', 'فندق المدينة', 'Madinah Hotel', sup_h2) RETURNING id INTO h_mad;
  INSERT INTO hotel_allotments (code, hotel_id, supplier_id, stay_from, stay_to, cutoff_date) VALUES ('ALT-MAK', h_mak, sup_h, '2026-10-10', '2026-11-01', '2026-10-01') RETURNING id INTO al_mak;
  INSERT INTO hotel_allotments (code, hotel_id, supplier_id, stay_from, stay_to, cutoff_date) VALUES ('ALT-MAD', h_mad, sup_h2, '2026-10-15', '2026-11-05', '2026-10-05') RETURNING id INTO al_mad;
  INSERT INTO allotment_rates VALUES (al_mak, 'DBL', 2, 380), (al_mak, 'TPL', 2, 420), (al_mak, 'QUAD', 3, 460), (al_mak, 'QUINT', 1, 500);
  INSERT INTO allotment_rates VALUES (al_mad, 'DBL', 2, 300), (al_mad, 'TPL', 2, 340), (al_mad, 'QUAD', 3, 380), (al_mad, 'QUINT', 1, 420);
  PERFORM pg_temp.ok((SELECT count(*) FROM allotment_inventory_daily WHERE allotment_id = al_mak) = 22 * 4, 'daily inventory grid seeded from contract');

  INSERT INTO trips (code, name, depart_date, return_date, fx_ref_rate, planned_pax, margin_pct)
  VALUES ('TRP-2026-014', 'Umrah 10 days', '2026-10-16', '2026-10-25', 13.10, 44, 12) RETURNING id INTO trip;
  SELECT c.code INTO cc FROM trips t JOIN cost_centers c ON c.id = t.cost_center_id WHERE t.id = trip;
  PERFORM pg_temp.ok(cc = 'CC-TRIP-2026-014', 'cost centre auto-opened as CC-TRIP-2026-014');
  INSERT INTO trip_stays VALUES (trip, 'MAK', al_mak, '2026-10-16', 5), (trip, 'MAD', al_mad, '2026-10-21', 4);
  INSERT INTO trip_cost_items (trip_id, category, name, currency, behavior, unit_price, child_factor, infant_factor)
    VALUES (trip, 'AIR', 'Flight', 'EGP', 'VAR', 16500, 0.75, 0.1), (trip, 'VISA', 'Visa', 'SAR', 'VAR', 450, 1, 1);
  INSERT INTO trip_cost_items (trip_id, category, name, currency, behavior, qty, unit_price) VALUES (trip, 'OPEX', 'Supervisor', 'EGP', 'FIXED', 1, 30000);
  PERFORM pg_temp.ok((SELECT net_cost_egp FROM v_trip_cost_per_type WHERE trip_id = trip AND room_type = 'DBL') >
                     (SELECT net_cost_egp FROM v_trip_cost_per_type WHERE trip_id = trip AND room_type = 'QUAD'), 'cost view: double costs more per pax than quad');

  -- ---------------- absorption (rooms pulled from allotment)
  INSERT INTO allotment_rooms (trip_id, city, allotment_id, room_type, virtual_code) VALUES (trip, 'MAK', al_mak, 'QUAD', 'V-MAK-Quad-01') RETURNING id INTO r_m;
  INSERT INTO allotment_rooms (trip_id, city, allotment_id, room_type, virtual_code) VALUES (trip, 'MAK', al_mak, 'QUAD', 'V-MAK-Quad-02') RETURNING id INTO r_f;
  INSERT INTO allotment_rooms (trip_id, city, allotment_id, room_type, virtual_code) VALUES (trip, 'MAK', al_mak, 'QUAD', 'V-MAK-Quad-03') RETURNING id INTO r_priv;
  INSERT INTO allotment_rooms (trip_id, city, allotment_id, room_type, virtual_code) VALUES (trip, 'MAK', al_mak, 'TPL', 'V-MAK-Triple-01') RETURNING id INTO r_pool;
  PERFORM pg_temp.ok((SELECT count(*) FROM hotel_beds WHERE room_id = r_m) = 4, 'quad room materialises 4 beds');
  PERFORM pg_temp.ok((SELECT consumed_company FROM allotment_inventory_daily WHERE allotment_id = al_mak AND room_type = 'QUAD' AND stay_date = '2026-10-18') = 3
                     AND (SELECT consumed_company FROM allotment_inventory_daily WHERE allotment_id = al_mak AND room_type = 'QUAD' AND stay_date = '2026-10-21') = 0,
                     'absorption consumes exactly the stay nights');
  PERFORM pg_temp.expect_error(format($q$INSERT INTO allotment_rooms (trip_id, city, allotment_id, room_type, virtual_code) VALUES (%s, 'MAK', %s, 'QUAD', 'V-MAK-Quad-04')$q$, trip, al_mak), 'inventory_not_oversold');
  PERFORM pg_temp.expect_error(format($q$INSERT INTO allotment_rooms (trip_id, city, allotment_id, room_type, virtual_code) VALUES (%s, 'MAK', %s, 'DBL', 'V-X')$q$, trip, al_mad), 'ALLOTMENT_MISMATCH');

  -- ---------------- bookings & governance
  INSERT INTO bookings (code, trip_id, channel, sale_mode, room_type, staff_id, gross_egp, net_egp) VALUES ('BK-1', trip, 'DIRECT', 'FULL_PACKAGE', 'QUAD', s_mgr, 47000, 47000) RETURNING id INTO b_man;
  PERFORM pg_temp.ok((SELECT status = 'SOFT_HOLD' AND hold_expires_at = created_at + interval '24 hours' FROM bookings WHERE id = b_man), 'new unpaid booking = SOFT_HOLD with 24h TTL');
  INSERT INTO bookings (code, trip_id, channel, sale_mode, room_type, staff_id, gross_egp, net_egp) VALUES ('BK-2', trip, 'DIRECT', 'FULL_PACKAGE', 'QUAD', s_mgr, 47000, 47000) RETURNING id INTO b_man2;
  INSERT INTO bookings (code, trip_id, channel, sale_mode, room_type, staff_id, gross_egp, net_egp) VALUES ('BK-3', trip, 'DIRECT', 'FULL_PACKAGE', 'QUAD', s_mgr, 47000, 47000) RETURNING id INTO b_wom;
  INSERT INTO bookings (code, trip_id, channel, sale_mode, room_type, staff_id, gross_egp, net_egp) VALUES ('BK-4', trip, 'DIRECT', 'PRIVATE_ROOM', 'QUAD', s_mgr, 188000, 188000) RETURNING id INTO b_fam;

  INSERT INTO bookings (code, trip_id, channel, sale_mode, room_type, staff_id, discount_pct, gross_egp, net_egp) VALUES ('BK-5', trip, 'DIRECT', 'FULL_PACKAGE', 'TPL', s_sales, 5, 49750, 47262) RETURNING id INTO b_disc;
  PERFORM pg_temp.ok((SELECT status FROM bookings WHERE id = b_disc) = 'PENDING_APPROVAL', 'sales staff 5% discount → PENDING_APPROVAL');
  INSERT INTO payments (booking_id, receipt_no, amount_egp, method) VALUES (b_disc, 'R-0', 10000, 'CASH');
  PERFORM pg_temp.ok((SELECT status FROM bookings WHERE id = b_disc) = 'PENDING_APPROVAL', 'money cannot bypass the approval gate');
  PERFORM pg_temp.expect_error(format('UPDATE bookings SET approved_by = %s WHERE id = %s', s_head, b_disc), 'APPROVER_AUTHORITY');
  UPDATE bookings SET approved_by = s_mgr WHERE id = b_disc;
  PERFORM pg_temp.ok((SELECT status FROM bookings WHERE id = b_disc) = 'DEPOSIT', 'manager approval → status derived from money (DEPOSIT)');

  INSERT INTO bookings (code, trip_id, channel, sale_mode, services, staff_id, net_egp) VALUES ('BK-6', trip, 'DIRECT', 'UNBUNDLED', '{VISA,AIR}', s_sales, 99999) RETURNING id INTO b_unb;
  PERFORM pg_temp.ok((SELECT status = 'PENDING_PRICING' AND net_egp IS NULL FROM bookings WHERE id = b_unb), 'unbundled → PENDING_PRICING with price column locked (NULL)');
  UPDATE bookings SET priced_by = s_mgr, net_egp = 31000 WHERE id = b_unb;
  PERFORM pg_temp.ok((SELECT status FROM bookings WHERE id = b_unb) = 'SOFT_HOLD', 'management price releases unbundled booking to SOFT_HOLD');

  PERFORM pg_temp.expect_error(format($q$INSERT INTO bookings (code, trip_id, channel, sale_mode, room_type, staff_id, net_egp, hold_expires_at) VALUES ('BK-T', %s, 'DIRECT', 'FULL_PACKAGE', 'QUAD', %s, 1000, now() + interval '30 minutes')$q$, trip, s_mgr), 'TTL_WINDOW');
  PERFORM pg_temp.expect_error(format($q$INSERT INTO bookings (code, trip_id, channel, sale_mode, room_type, staff_id, net_egp, hold_expires_at) VALUES ('BK-T', %s, 'DIRECT', 'FULL_PACKAGE', 'QUAD', %s, 1000, now() + interval '30 hours')$q$, trip, s_mgr), 'bk_ttl_window');

  INSERT INTO payments (booking_id, receipt_no, amount_egp, method) VALUES (b_man, 'R-1', 20000, 'CASH');
  PERFORM pg_temp.ok((SELECT status = 'DEPOSIT' AND hold_expires_at IS NULL FROM bookings WHERE id = b_man), 'deposit → DEPOSIT, TTL cleared');
  INSERT INTO payments (booking_id, receipt_no, amount_egp, method) VALUES (b_man, 'R-2', 27000, 'BANK_DEPOSIT');
  PERFORM pg_temp.ok((SELECT status FROM bookings WHERE id = b_man) = 'CONFIRMED', 'full payment → CONFIRMED');

  -- ---------------- passengers
  INSERT INTO passengers (booking_id, name_ar, name_en, gender, pax_type, birth_date, passport_no, passport_expiry) VALUES (b_man, 'خالد', 'KHALED MOSTAFA', 'M', 'ADULT', '1985-06-11', 'A1111111', '2030-01-01') RETURNING id INTO p_man;
  INSERT INTO passengers (booking_id, name_ar, name_en, gender, pax_type, birth_date, passport_no, passport_expiry) VALUES (b_man2, 'سيد', 'SAYED HEGAZY', 'M', 'ADULT', '1958-12-01', 'A2222222', '2027-01-01') RETURNING id INTO p_man2;
  INSERT INTO passengers (booking_id, name_ar, name_en, gender, pax_type, birth_date, passport_no, passport_expiry) VALUES (b_wom, 'نادية', 'NADIA KAMAL', 'F', 'ADULT', '1975-08-14', 'A3333333', '2030-01-01') RETURNING id INTO p_wom;
  INSERT INTO passengers (booking_id, name_ar, name_en, gender, pax_type, birth_date, passport_no, passport_expiry) VALUES (b_fam, 'أحمد', 'AHMED MAHMOUD', 'M', 'ADULT', '1961-03-12', 'A4444444', '2030-01-01') RETURNING id INTO p_fa;
  INSERT INTO passengers (booking_id, name_ar, name_en, gender, pax_type, birth_date, passport_no, passport_expiry) VALUES (b_fam, 'فاطمة', 'FATMA HASSAN', 'F', 'ADULT', '1965-07-02', 'A5555555', '2030-01-01') RETURNING id INTO p_fm;
  INSERT INTO passengers (booking_id, name_ar, name_en, gender, pax_type, birth_date, passport_no, passport_expiry) VALUES (b_fam, 'آدم', 'ADAM YOUSSEF', 'M', 'CHD', '2019-05-09', 'A6666666', '2030-01-01') RETURNING id INTO p_chd;
  INSERT INTO passengers (booking_id, name_ar, name_en, gender, pax_type, birth_date, passport_no, passport_expiry) VALUES (b_fam, 'ليلى', 'LAILA YOUSSEF', 'F', 'INF', '2025-04-01', 'A7777777', '2030-01-01') RETURNING id INTO p_inf;
  PERFORM pg_temp.expect_error(format($q$INSERT INTO passengers (booking_id, name_ar, name_en, gender, pax_type, birth_date, passport_no, passport_expiry) VALUES (%s, 'x', 'khaled lower', 'M', 'ADULT', '1990-01-01', 'A9', '2030-01-01')$q$, b_man), 'passengers_name_en_check');
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM v_passport_alerts WHERE passenger_id = p_man2 AND alert = 'LESS_THAN_6_MONTHS'), 'passport < 6 months after return is flagged');

  -- ---------------- strict gender lock
  SELECT id INTO bed_m1 FROM hotel_beds WHERE room_id = r_m AND bed_no = 1;
  SELECT id INTO bed_m2 FROM hotel_beds WHERE room_id = r_m AND bed_no = 2;
  SELECT id INTO bed_f1 FROM hotel_beds WHERE room_id = r_f AND bed_no = 1;
  PERFORM pg_temp.expect_error(format('UPDATE hotel_beds SET passenger_id = %s WHERE id = %s', p_man, bed_m1), 'ROOM_NOT_OPENED');
  UPDATE allotment_rooms SET gender_lock = 'M' WHERE id = r_m;
  UPDATE allotment_rooms SET gender_lock = 'F' WHERE id = r_f;
  UPDATE hotel_beds SET passenger_id = p_man WHERE id = bed_m1;
  UPDATE hotel_beds SET passenger_id = p_wom WHERE id = bed_f1;
  PERFORM pg_temp.expect_error(format('UPDATE hotel_beds SET passenger_id = %s WHERE id = %s', p_wom, bed_m2), 'GENDER_MIX_FORBIDDEN');
  PERFORM pg_temp.expect_error(format($q$UPDATE allotment_rooms SET gender_lock = 'F' WHERE id = %s$q$, r_m), 'GENDER_MIX_FORBIDDEN');
  PERFORM pg_temp.expect_error(format('UPDATE allotment_rooms SET gender_lock = NULL WHERE id = %s', r_m), 'ROOM_OCCUPIED');
  PERFORM pg_temp.expect_error(format('UPDATE hotel_beds SET passenger_id = %s WHERE id = %s', p_chd, bed_m2), 'NO_BED_PAX');
  PERFORM pg_temp.expect_error(format('UPDATE hotel_beds SET passenger_id = %s WHERE id = %s', p_fa, bed_m2), 'PRIVATE_BOOKING_IN_SHARED_ROOM');
  -- same pax cannot hold two Makkah beds (deferred unique → checked immediately here)
  SET CONSTRAINTS one_bed_per_city IMMEDIATE;
  PERFORM pg_temp.expect_error(format('UPDATE hotel_beds SET passenger_id = %s WHERE id = %s', p_man, bed_m2), 'one_bed_per_city');
  SET CONSTRAINTS one_bed_per_city DEFERRED;

  -- open-room helper pulls from pool and locks gender
  PERFORM pg_temp.ok(fn_open_shared_room(trip, 'MAK', 'TPL', 'M') = r_pool, 'fn_open_shared_room pulls the pool room');
  PERFORM pg_temp.expect_error(format($q$SELECT fn_open_shared_room(%s, 'MAK', 'TPL', 'F')$q$, trip), 'POOL_EXHAUSTED');

  -- ---------------- private room (family, gender check skipped)
  UPDATE allotment_rooms SET gender_lock = 'PRIVATE', private_booking_id = b_fam WHERE id = r_priv;
  SELECT id INTO bed_p1 FROM hotel_beds WHERE room_id = r_priv AND bed_no = 1;
  SELECT id INTO bed_p2 FROM hotel_beds WHERE room_id = r_priv AND bed_no = 2;
  SELECT id INTO bed_p3 FROM hotel_beds WHERE room_id = r_priv AND bed_no = 3;
  UPDATE hotel_beds SET passenger_id = p_fa WHERE id = bed_p1;
  UPDATE hotel_beds SET passenger_id = p_fm WHERE id = bed_p2;
  PERFORM pg_temp.ok((SELECT count(*) FROM hotel_beds WHERE room_id = r_priv AND passenger_id IS NOT NULL) = 2, 'private room hosts mixed-gender family');
  PERFORM pg_temp.expect_error(format('UPDATE hotel_beds SET passenger_id = %s WHERE id = %s', p_man2, bed_p3), 'PRIVATE_ROOM');
  PERFORM pg_temp.expect_error(format($q$INSERT INTO hotel_beds (room_id, bed_no, city, passenger_id) VALUES (%s, 5, 'MAK', %s)$q$, r_m, p_man2), 'BED_OUT_OF_RANGE');

  -- ---------------- swap
  UPDATE hotel_beds SET passenger_id = p_man2 WHERE id = bed_m2;
  PERFORM pg_temp.expect_error(format('SELECT fn_swap_beds(%s, %s)', bed_m1, bed_f1), 'GENDER_MIX_FORBIDDEN');
  PERFORM pg_temp.ok((SELECT passenger_id FROM hotel_beds WHERE id = bed_m1) = p_man, 'rejected swap leaves beds untouched');
  PERFORM fn_swap_beds(bed_m1, bed_m2);
  PERFORM pg_temp.ok((SELECT passenger_id FROM hotel_beds WHERE id = bed_m1) = p_man2 AND (SELECT passenger_id FROM hotel_beds WHERE id = bed_m2) = p_man, 'same-gender swap succeeds atomically');

  -- ---------------- rooming list view (+ no-bed pax attached to family room)
  UPDATE allotment_rooms SET physical_no = '1204' WHERE id = r_priv;
  PERFORM pg_temp.ok((SELECT count(*) FROM v_rooming_list WHERE trip_id = trip AND city = 'MAK' AND room_no = '1204') = 4, 'rooming list: 2 adults + child + infant under physical room 1204');
  PERFORM pg_temp.expect_error(format($q$UPDATE allotment_rooms SET physical_no = '1204' WHERE id = %s$q$, r_m), 'allotment_rooms_physical_uq');

  -- ---------------- rooming lock
  INSERT INTO rooming_locks (trip_id, city, locked_by) VALUES (trip, 'MAK', s_mgr);
  PERFORM pg_temp.expect_error(format('UPDATE hotel_beds SET passenger_id = NULL WHERE id = %s', bed_m1), 'ROOMING_LOCKED');
  DELETE FROM rooming_locks WHERE trip_id = trip AND city = 'MAK';

  -- ---------------- soft-hold sweeper
  INSERT INTO bookings (code, trip_id, channel, sale_mode, room_type, staff_id, net_egp) VALUES ('BK-7', trip, 'DIRECT', 'FULL_PACKAGE', 'QUAD', s_mgr, 47000) RETURNING id INTO b_ttl;
  UPDATE passengers SET booking_id = b_ttl WHERE id = p_man2;   -- move Sayed to an unpaid hold booking
  UPDATE bookings SET hold_expires_at = now() - interval '1 minute' WHERE id = b_ttl;
  n := fn_release_expired_holds(now());
  PERFORM pg_temp.ok(n >= 1 AND (SELECT status FROM bookings WHERE id = b_ttl) = 'EXPIRED', 'expired hold swept to EXPIRED');
  PERFORM pg_temp.ok((SELECT passenger_id FROM hotel_beds WHERE id = bed_m1) IS NULL, 'expired hold released its bed automatically');
  PERFORM pg_temp.expect_error(format($q$UPDATE bookings SET status = 'SOFT_HOLD' WHERE id = %s$q$, b_ttl), 'TERMINAL_STATUS');

  -- ---------------- B2B wallet & credit ceiling
  INSERT INTO b2b_agents (code, name, tier, net_discount_pct, pin_hash) VALUES ('AG-1', 'Agent', 'B2B', 6, 'x') RETURNING id INTO ag;
  INSERT INTO agent_wallets VALUES (ag, 'EGP', 0, 50000);
  INSERT INTO wallet_transactions (agent_id, txn_type, amount) VALUES (ag, 'TOPUP', 10000);
  INSERT INTO wallet_transactions (agent_id, txn_type, amount) VALUES (ag, 'BOOKING_DEBIT', -55000);
  PERFORM pg_temp.ok((SELECT balance FROM agent_wallets WHERE agent_id = ag) = -45000, 'wallet may use credit line');
  PERFORM pg_temp.expect_error(format($q$INSERT INTO wallet_transactions (agent_id, txn_type, amount) VALUES (%s, 'BOOKING_DEBIT', -6000)$q$, ag), 'wallet_credit_ceiling');
  PERFORM pg_temp.expect_error(format($q$INSERT INTO wallet_transactions (agent_id, txn_type, amount) VALUES (%s, 'BOOKING_DEBIT', 100)$q$, ag), 'wallet_transactions_check');
  INSERT INTO b2b_agents (code, name, tier, pin_hash, overdue_since) VALUES ('AG-2', 'Late agent', 'B2B', 'x', '2026-09-01') RETURNING id INTO ag_over;
  INSERT INTO agent_wallets VALUES (ag_over, 'EGP', 0, 100000);
  PERFORM pg_temp.expect_error(format($q$INSERT INTO wallet_transactions (agent_id, txn_type, amount) VALUES (%s, 'BOOKING_DEBIT', -100)$q$, ag_over), 'CREDIT_LOCK');
  PERFORM pg_temp.expect_error(format($q$INSERT INTO bookings (code, trip_id, channel, sale_mode, room_type, agent_id, net_egp) VALUES ('BK-8', %s, 'B2B', 'FULL_PACKAGE', 'QUAD', %s, 44000)$q$, trip, ag_over), 'CREDIT_LOCK');
  PERFORM pg_temp.expect_error(format($q$INSERT INTO bookings (code, trip_id, channel, sale_mode, room_type, agent_id, net_egp) VALUES ('BK-9', %s, 'BROKER', 'FULL_PACKAGE', 'QUAD', %s, 44000)$q$, trip, ag), 'CHANNEL_MISMATCH');

  -- ---------------- bus seats
  INSERT INTO bus_trips (trip_id, plate_no, capacity) VALUES (trip, 'NQA-4521', 49) RETURNING id INTO bus;
  INSERT INTO bus_seats (bus_trip_id, seat_no, passenger_id) VALUES (bus, 1, p_fa), (bus, 2, p_fm), (bus, 3, p_chd);
  PERFORM pg_temp.expect_error(format('INSERT INTO bus_seats (bus_trip_id, seat_no, passenger_id) VALUES (%s, 4, %s)', bus, p_inf), 'INFANT_NO_SEAT');
  PERFORM pg_temp.expect_error(format('INSERT INTO bus_seats (bus_trip_id, seat_no) VALUES (%s, 50)', bus), 'SEAT_OUT_OF_RANGE');

  -- ---------------- passport chain of custody
  INSERT INTO passport_vault (passenger_id, stage) VALUES (p_fa, 'REP');
  PERFORM pg_temp.expect_error(format($q$INSERT INTO passport_vault (passenger_id, stage) VALUES (%s, 'CONSULATE')$q$, p_fa), 'CUSTODY_CHAIN');
  INSERT INTO passport_vault (passenger_id, stage, moved_at) VALUES (p_fa, 'SAFE', now() + interval '1 second');
  PERFORM pg_temp.ok((SELECT stage FROM v_passport_current WHERE passenger_id = p_fa) = 'SAFE', 'passport vault tracks current custody');

  -- ---------------- FX settlements & price lock & P&L
  INSERT INTO supplier_settlements (trip_id, supplier_id, reference, amount_sar, fx_ref_rate, fx_actual_rate) VALUES (trip, sup_h, 'Dep-1', 10000, 1, 13.40);
  PERFORM pg_temp.ok((SELECT fx_variance_egp FROM supplier_settlements WHERE trip_id = trip) = 3000.00, 'FX variance = 10,000 × (13.40 − 13.10) = 3,000 (ref snapshotted from trip)');
  INSERT INTO trip_price_list VALUES (trip, 'QUAD', 47000);
  UPDATE trips SET prices_locked_at = now(), prices_locked_by = s_mgr WHERE id = trip;
  PERFORM pg_temp.expect_error(format($q$UPDATE trip_price_list SET price_egp = 1 WHERE trip_id = %s$q$, trip), 'PRICE_LOCKED');
  SELECT * INTO rec FROM fn_trip_pnl(trip, 13.36);
  PERFORM pg_temp.ok(rec.revenue_egp > 0 AND rec.net_profit_egp = rec.operating_profit_egp - rec.fx_loss_egp, 'P&L: net = operating − FX impact');
  PERFORM pg_temp.ok((SELECT count(*) FROM v_allotment_heatmap WHERE allotment_id = al_mak) = 22, 'heatmap view: one row per stay date');
  PERFORM pg_temp.ok((SELECT count(*) FROM v_breakage_beds WHERE trip_id = trip) >= 1, 'breakage view exposes free shared beds');

  RAISE NOTICE '================ ALL DATABASE INVARIANT TESTS PASSED ================';
END $$;
ROLLBACK;
