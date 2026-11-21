-- ─────────────────────────────────────────────────────────────
-- supabase/seed/demo.sql — SOLO para la instancia DEMO.
-- Correr en un proyecto Supabase SEPARADO, nunca en producción.
-- Todos los datos son ficticios.
-- ─────────────────────────────────────────────────────────────

-- Marca de instancia demo: el login demo solo funciona si esta tabla existe
-- y tiene una fila (la base de producción no la tiene).
create table if not exists public.demo_instance (
  id         boolean primary key default true check (id),
  creada_en  timestamptz not null default now(),
  nota       text not null default 'Instancia demo — datos ficticios'
);
alter table public.demo_instance enable row level security;
revoke all on public.demo_instance from anon, authenticated;
insert into public.demo_instance (id) values (true) on conflict do nothing;

-- Usuario demo (solo lectura)
insert into public.team_members (email, nombre, rol) values
  ('demo@demo.gno', 'Invitado Demo', 'viewer')
on conflict (email) do update set rol = 'viewer', activo = true;

-- Clientes ficticios
insert into public.clients (id, nombre_dueno, nombre_compania, email, telefono, idioma, industria, activo) values
  ('d0000000-0000-4000-8000-000000000001','Carlos Rivera','Bayou Drywall LLC','carlos@example.com','504-555-0101','espanol','construction',true),
  ('d0000000-0000-4000-8000-000000000002','Ana Morales','Crescent Tacos LLC','ana@example.com','504-555-0102','espanol','restaurant',true),
  ('d0000000-0000-4000-8000-000000000003','Luis Herrera','Delta Painting Co','luis@example.com','504-555-0103','espanol','construction',true),
  ('d0000000-0000-4000-8000-000000000004','Grace Thompson','Lakeview Auto Repair','grace@example.com','504-555-0104','english','auto repair',true),
  ('d0000000-0000-4000-8000-000000000005','Sofía Castro','Magnolia Bakery & Café','sofia@example.com','985-555-0105','espanol','restaurant',true),
  ('d0000000-0000-4000-8000-000000000006','Pedro Gómez','Riverbend Roofing Inc','pedro@example.com','504-555-0106','espanol','construction',true)
on conflict (id) do nothing;

-- Auditorías WC / GL
insert into public.audits (client_id, linea, carrier, poliza, vigencia_desde, vigencia_hasta, fecha_limite, estatus, base_tipo, clases, base_estimada, base_real, deposito, resultado, asignado_a, notas) values
  ('d0000000-0000-4000-8000-000000000001','WC','Demo Casualty','WC-DEMO-1001','2025-10-24','2026-10-24','2026-11-30','review','subcontract_cost','5445 / 5474',100000,88243,6673,-904.32,null,'Subcontratistas sin COI; crédito estimado'),
  ('d0000000-0000-4000-8000-000000000003','WC','Sample Mutual','WC-DEMO-2002','2025-09-16','2026-09-16','2026-11-20','sent','subcontract_cost','5645 / 5474',90000,148590,5578,3485.00,null,'Prima adicional estimada'),
  ('d0000000-0000-4000-8000-000000000003','GL','Example Specialty','GL-DEMO-3003','2025-11-07','2026-11-07','2026-11-29','in_progress','gross_sales','91340',250000,null,2127,null,null,'En preparación'),
  ('d0000000-0000-4000-8000-000000000006','GL','Demo Casualty','GL-DEMO-4004','2025-12-01','2026-12-01','2027-01-15','pending_docs','gross_sales','91580',400000,null,5200,null,null,'Faltan statements de nov');

-- Sales tax: perfiles y período de octubre 2026
insert into public.sales_tax_profiles (client_id, tasa_estatal, parroquia, tasa_parroquia, nota_parroquia, frecuencia_estado, frecuencia_parroquia) values
  ('d0000000-0000-4000-8000-000000000002',0.05,'Jefferson',0.0475,'B. 4.75%','monthly','monthly'),
  ('d0000000-0000-4000-8000-000000000004',0.05,'Jefferson',0.0475,'B. 4.75%','monthly','monthly'),
  ('d0000000-0000-4000-8000-000000000005',0.05,'St. Tammany',0.0425,'Col. A Dist. 3','monthly','monthly')
on conflict (client_id) do nothing;

insert into public.sales_tax_periods (client_id, periodo, ventas_brutas, impuesto_estado, impuesto_parroquia, estatus, presentado_por, presentado_en, confirmacion_estado) values
  ('d0000000-0000-4000-8000-000000000002','2026-10-01',48250.00,2412.50,2291.88,'paid','demo@demo.gno','2026-11-14 15:20-06','LDR-DEMO-0001'),
  ('d0000000-0000-4000-8000-000000000004','2026-10-01',31780.40,1589.02,1509.57,'review',null,null,null),
  ('d0000000-0000-4000-8000-000000000005','2026-10-01',null,null,null,'pending_docs',null,null,null)
on conflict (client_id, periodo) do nothing;

-- Nómina 2026 T3
insert into public.payroll_profiles (client_id, depositante, tasa_suta) values
  ('d0000000-0000-4000-8000-000000000004','monthly',0.0120),
  ('d0000000-0000-4000-8000-000000000006','semiweekly',0.0210)
on conflict (client_id) do nothing;

insert into public.payroll_quarters (client_id, anio, trimestre, empleados, salarios, fed_wh, la_wh, suta_salarios, futa_salarios, estatus) values
  ('d0000000-0000-4000-8000-000000000004',2026,3,6,78400.00,7840.00,2352.00,42000.00,42000.00,'filed'),
  ('d0000000-0000-4000-8000-000000000006',2026,3,14,212600.00,23386.00,6378.00,98000.00,98000.00,'review')
on conflict (client_id, anio, trimestre) do nothing;

-- Entregas (registros de entrega con hora y ubicación en Drive)
insert into public.entregas (client_id, modulo, entidad, tipo, periodo, destinatario, destinatario_contacto, canal, entregado_en, entregado_por, confirmacion, monto, drive_folder_url, ubicacion, notas) values
  ('d0000000-0000-4000-8000-000000000003','audit','audit','WC audit','2025-09-16/2026-09-16','Sample Mutual','audit@example.com','email','2026-11-18 10:42-06','demo@demo.gno','Borrador enviado',null,'https://drive.google.com/drive/folders/DEMO-WC','GNO Clients > Audits > Delta Painting > WC 2025-2026','P&L + Subcontractor Report + 3 COIs'),
  ('d0000000-0000-4000-8000-000000000002','sales_tax','sales_tax_period','LA R-1029 + Jefferson','2026-10','LDR / Jefferson Parish','LaTAP','portal','2026-11-14 15:20-06','demo@demo.gno','LDR-DEMO-0001',4704.38,'https://drive.google.com/drive/folders/DEMO-ST','GNO Clients > Crescent Tacos > Sales Tax > 2026-10',null),
  ('d0000000-0000-4000-8000-000000000004','payroll','payroll_quarter','941 + L-1 + LWC','2026-Q3','IRS / LDR / LWC','EFTPS / LaTAP / LWC eServices','portal','2026-10-28 09:05-05','demo@demo.gno','EFTPS-DEMO-77',null,'https://drive.google.com/drive/folders/DEMO-PR','GNO Clients > Lakeview Auto > Payroll > 2026-Q3',null),
  ('d0000000-0000-4000-8000-000000000001','informe','report','Informe mensual (video)','2026-10','Cliente','carlos@example.com','email','2026-11-10 08:00-06','demo@demo.gno',null,null,null,null,'Abierto por el cliente');

-- Personas e identificadores (todos ficticios; el valor cifrado es un marcador)
insert into public.personas (id, client_id, nombre, rol, updated_by) values
  ('d1000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001','Carlos Rivera','owner','demo@demo.gno'),
  ('d1000000-0000-4000-8000-000000000002','d0000000-0000-4000-8000-000000000004','Grace Thompson','owner','demo@demo.gno')
on conflict (id) do nothing;

insert into public.identificadores (client_id, persona_id, tipo, valor_enc, last4, huella, updated_by) values
  ('d0000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','ITIN','v1.REVNTw==.REVNTw==.REVNTw==','0001',md5('demo-itin-1')||md5('x1'),'demo@demo.gno'),
  ('d0000000-0000-4000-8000-000000000004','d1000000-0000-4000-8000-000000000002','SSN','v1.REVNTw==.REVNTw==.REVNTw==','0002',md5('demo-ssn-2')||md5('x2'),'demo@demo.gno'),
  ('d0000000-0000-4000-8000-000000000004',null,'EIN','v1.REVNTw==.REVNTw==.REVNTw==','0003',md5('demo-ein-3')||md5('x3'),'demo@demo.gno')
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────
-- Módulo Entidad y Equity (0013): casos 2 a 5 de la spec, todo ficticio.
-- Los ids deben coincidir con src/lib/entity/demo-cases.ts.
--   caso 2: sole proprietor            (d0…0007)
--   caso 3: LLC un miembro → S-corp    (d0…0008)  elige S-corp el 01/01/2026, capital previo $20,000
--   caso 4: S-corp 60/40               (d0…0009)  distribuciones 50/50
--   caso 5: partnership 50/50 → 70/30  (d0…0010)  cambio el 01/07/2026
-- El caso 1 (piloto real) NO va en la demo.
-- ─────────────────────────────────────────────────────────────
insert into public.clients (id, nombre_dueno, nombre_compania, email, telefono, idioma, industria, activo) values
  ('d0000000-0000-4000-8000-000000000007','Marie Delacroix','Magnolia Lawn Care (sole prop)','marie@example.com','504-555-0107','espanol','landscaping',true),
  ('d0000000-0000-4000-8000-000000000008','Theo Broussard','Bayou Print Studio LLC','theo@example.com','504-555-0108','english','printing',true),
  ('d0000000-0000-4000-8000-000000000009','Lena Fontenot','Crescent Design Group Inc','lena@example.com','985-555-0109','espanol','design',true),
  ('d0000000-0000-4000-8000-000000000010','Nora Thibodeaux','Cypress Home Partners LLC','nora@example.com','504-555-0110','english','home services',true)
on conflict (id) do nothing;

insert into public.personas (id, client_id, nombre, rol, updated_by) values
  ('d1000000-0000-4000-8000-000000000007','d0000000-0000-4000-8000-000000000007','Marie Delacroix','owner','demo@demo.gno'),
  ('d1000000-0000-4000-8000-000000000008','d0000000-0000-4000-8000-000000000008','Theo Broussard','owner','demo@demo.gno'),
  ('d1000000-0000-4000-8000-000000000009','d0000000-0000-4000-8000-000000000009','Lena Fontenot','owner','demo@demo.gno'),
  ('d1000000-0000-4000-8000-000000000010','d0000000-0000-4000-8000-000000000009','Marcus Guidry','owner','demo@demo.gno'),
  ('d1000000-0000-4000-8000-000000000011','d0000000-0000-4000-8000-000000000010','Nora Thibodeaux','owner','demo@demo.gno'),
  ('d1000000-0000-4000-8000-000000000012','d0000000-0000-4000-8000-000000000010','Remy Landry','owner','demo@demo.gno')
on conflict (id) do nothing;

-- Identificadores ficticios (valor cifrado = marcador; solo los últimos 4 se muestran, enmascarados)
insert into public.identificadores (client_id, persona_id, tipo, valor_enc, last4, huella, updated_by) values
  ('d0000000-0000-4000-8000-000000000007','d1000000-0000-4000-8000-000000000007','SSN', 'v1.REVNTw==.REVNTw==.REVNTw==','0107',md5('demo-ssn-107')||md5('z107'),'demo@demo.gno'),
  ('d0000000-0000-4000-8000-000000000008','d1000000-0000-4000-8000-000000000008','ITIN','v1.REVNTw==.REVNTw==.REVNTw==','0108',md5('demo-itin-108')||md5('z108'),'demo@demo.gno'),
  ('d0000000-0000-4000-8000-000000000009','d1000000-0000-4000-8000-000000000009','SSN', 'v1.REVNTw==.REVNTw==.REVNTw==','0109',md5('demo-ssn-109')||md5('z109'),'demo@demo.gno'),
  ('d0000000-0000-4000-8000-000000000009','d1000000-0000-4000-8000-000000000010','SSN', 'v1.REVNTw==.REVNTw==.REVNTw==','0110',md5('demo-ssn-110')||md5('z110'),'demo@demo.gno'),
  ('d0000000-0000-4000-8000-000000000010','d1000000-0000-4000-8000-000000000011','ITIN','v1.REVNTw==.REVNTw==.REVNTw==','0111',md5('demo-itin-111')||md5('z111'),'demo@demo.gno'),
  ('d0000000-0000-4000-8000-000000000010','d1000000-0000-4000-8000-000000000012','SSN', 'v1.REVNTw==.REVNTw==.REVNTw==','0112',md5('demo-ssn-112')||md5('z112'),'demo@demo.gno')
on conflict do nothing;

insert into public.entity_profile (client_id, legal_form, state_of_formation, formation_date, fiscal_year_end, ein_last4, updated_by) values
  ('d0000000-0000-4000-8000-000000000007','sole_prop','LA','2021-03-01','12-31',null,'demo@demo.gno'),
  ('d0000000-0000-4000-8000-000000000008','llc_single','LA','2022-05-15','12-31','0108','demo@demo.gno'),
  ('d0000000-0000-4000-8000-000000000009','corporation','LA','2019-09-01','12-31','0109','demo@demo.gno'),
  ('d0000000-0000-4000-8000-000000000010','llc_multi','LA','2020-02-01','12-31','0110','demo@demo.gno')
on conflict (client_id) do nothing;

insert into public.tax_classification (client_id, classification, effective_date, election_form, election_doc, updated_by) values
  ('d0000000-0000-4000-8000-000000000007','disregarded','2021-03-01','none',null,'demo@demo.gno'),
  ('d0000000-0000-4000-8000-000000000008','disregarded','2022-05-15','none',null,'demo@demo.gno'),
  ('d0000000-0000-4000-8000-000000000008','s_corp','2026-01-01','2553','GNO Clients > Bayou Print Studio > Entity > Carta IRS CP261.pdf','demo@demo.gno'),
  ('d0000000-0000-4000-8000-000000000009','s_corp','2019-09-01','2553','GNO Clients > Crescent Design > Entity > Carta IRS CP261.pdf','demo@demo.gno'),
  ('d0000000-0000-4000-8000-000000000010','partnership','2020-02-01','none',null,'demo@demo.gno')
on conflict (client_id, effective_date) do nothing;

-- Dueños (caso 3: oficial; caso 4: 60/40; caso 5: tramos 50/50 hasta el 30/06 y 70/30 desde el 01/07)
insert into public.owners (client_id, persona_id, role, holder_type, ownership_pct, start_date, end_date, is_officer, updated_by) values
  ('d0000000-0000-4000-8000-000000000007','d1000000-0000-4000-8000-000000000007','owner','individual',100,'2021-03-01',null,false,'demo@demo.gno'),
  ('d0000000-0000-4000-8000-000000000008','d1000000-0000-4000-8000-000000000008','member','individual',100,'2022-05-15',null,true,'demo@demo.gno'),
  ('d0000000-0000-4000-8000-000000000009','d1000000-0000-4000-8000-000000000009','shareholder','individual',60,'2019-09-01',null,true,'demo@demo.gno'),
  ('d0000000-0000-4000-8000-000000000009','d1000000-0000-4000-8000-000000000010','shareholder','individual',40,'2019-09-01',null,false,'demo@demo.gno'),
  ('d0000000-0000-4000-8000-000000000010','d1000000-0000-4000-8000-000000000011','partner','individual',50,'2020-02-01','2026-06-30',false,'demo@demo.gno'),
  ('d0000000-0000-4000-8000-000000000010','d1000000-0000-4000-8000-000000000012','partner','individual',50,'2020-02-01','2026-06-30',false,'demo@demo.gno'),
  ('d0000000-0000-4000-8000-000000000010','d1000000-0000-4000-8000-000000000011','partner','individual',70,'2026-07-01',null,false,'demo@demo.gno'),
  ('d0000000-0000-4000-8000-000000000010','d1000000-0000-4000-8000-000000000012','partner','individual',30,'2026-07-01',null,false,'demo@demo.gno')
on conflict (client_id, persona_id, start_date) do nothing;

-- Nómina 2026 del caso 4 (la S-corp 60/40 sí paga sueldo al oficial → sin alerta de sueldo razonable).
-- El caso 3 NO tiene nómina a propósito: debe disparar la alerta.
insert into public.payroll_quarters (client_id, anio, trimestre, empleados, salarios, estatus) values
  ('d0000000-0000-4000-8000-000000000009',2026,1,1,20000.00,'filed'),
  ('d0000000-0000-4000-8000-000000000009',2026,2,1,20000.00,'filed'),
  ('d0000000-0000-4000-8000-000000000009',2026,3,1,20000.00,'filed')
on conflict (client_id, anio, trimestre) do nothing;

-- Saldos iniciales al 31/12/2025 (cuadran: activos − pasivos − capital = 0)
insert into public.opening_balances (client_id, as_of, account_code, account_name, owner_id, amount, source, updated_by)
select v.client_id, '2025-12-31', v.code, v.name,
       (select o.id from public.owners o where o.client_id = v.client_id and o.persona_id = v.persona and o.start_date <= '2025-12-31'
         order by o.start_date desc limit 1),
       v.amount, 'GNO', 'demo@demo.gno'
from (values
  ('d0000000-0000-4000-8000-000000000007'::uuid, '10100', 'Demo Bank Operating',   null::uuid,                                        10000.00),
  ('d0000000-0000-4000-8000-000000000007'::uuid, '30000', 'Owner''s Capital',       null::uuid,                                        10000.00),
  ('d0000000-0000-4000-8000-000000000008'::uuid, '10100', 'Demo Bank Operating',   null::uuid,                                        20000.00),
  ('d0000000-0000-4000-8000-000000000008'::uuid, '30000', 'Owner''s Capital',       null::uuid,                                        20000.00),
  ('d0000000-0000-4000-8000-000000000009'::uuid, '10100', 'Demo Bank Operating',   null::uuid,                                        30000.00),
  ('d0000000-0000-4000-8000-000000000009'::uuid, '31000', 'Common Stock',          'd1000000-0000-4000-8000-000000000009'::uuid,      18000.00),
  ('d0000000-0000-4000-8000-000000000009'::uuid, '31000', 'Common Stock',          'd1000000-0000-4000-8000-000000000010'::uuid,      12000.00),
  ('d0000000-0000-4000-8000-000000000010'::uuid, '10100', 'Demo Bank Operating',   null::uuid,                                        50000.00),
  ('d0000000-0000-4000-8000-000000000010'::uuid, '30100', 'Partner Capital',       'd1000000-0000-4000-8000-000000000011'::uuid,      25000.00),
  ('d0000000-0000-4000-8000-000000000010'::uuid, '30101', 'Partner Capital',       'd1000000-0000-4000-8000-000000000012'::uuid,      25000.00)
) as v(client_id, code, name, persona, amount)
where not exists (select 1 from public.opening_balances b where b.client_id = v.client_id);

-- Catálogo de Equity y alta confirmada para los cuatro clientes demo (idempotente)
do $$
declare c uuid;
begin
  foreach c in array array[
    'd0000000-0000-4000-8000-000000000007','d0000000-0000-4000-8000-000000000008',
    'd0000000-0000-4000-8000-000000000009','d0000000-0000-4000-8000-000000000010']::uuid[] loop
    if not exists (select 1 from public.entity_profile e where e.client_id = c and e.setup_completed_at is not null) then
      perform public.entity_complete_setup(c, 'demo@demo.gno');
    end if;
  end loop;
end $$;
