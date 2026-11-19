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
