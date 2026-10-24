-- Importa los datos del Excel "Expenses.xlsx" (hojas Gastos y Pendiente) al módulo de finanzas.
-- Requisito: haber ejecutado antes 04_finanzas.sql.
-- Ejecutar UNA sola vez en Supabase > SQL Editor (si lo corres dos veces, duplica los datos).
--
-- El SQL Editor no tiene sesión, así que se indica la cuenta por su correo: cámbialo si tu cuenta
-- de JustMe usa otro. Si el correo no existe, el script falla sin insertar nada.

do $$
declare
  uid uuid := (select id from auth.users where email = 'dotjmanuel@gmail.com');
begin
  if uid is null then
    raise exception 'No existe un usuario con ese correo: revisa la línea de arriba';
  end if;

  insert into public.fin_settings (user_id, monthly_income) values (uid, 15000)
  on conflict (user_id) do update set monthly_income = excluded.monthly_income;

  insert into public.fin_expenses (user_id, section, concept, installment, total, amount)
  select uid, v.* from (values
    ('santander','Zurich Santander','',198.7,198.7),
    ('santander','Netflix','',348,348),
    ('santander','Laptop','05/09',21999.01,2444.33),
    ('santander','Nintendo','4/12',9789,815.75),
    ('santander','pk','',18,18),
    ('santander','rec','',50,50),
    ('santander','shein botas','',610,610),
    ('santander','ml pinturas','',307,307),
    ('santander','rec','',100,100),
    ('santander','shein botas','',511.4,511.4),
    ('santander','tktk pans','',518,518),
    ('santander','rec','',50,50),
    ('santander','shein pans','',204,204),
    ('santander','recarga','',30,30),
    ('santander','recarga','',100,100),
    ('bbva','HBO','',74,74),
    ('bbva','Claude','',350,350),
    ('bbva','Disney','',259,259),
    ('bbva','rec','',100,100),
    ('bbva','amazon','',398,398),
    ('bbva','rec','',100,100),
    ('bbva','internet','',661,661),
    ('bbva','tktk','',485,485),
    ('fijos','Internet','',null,500),
    ('fijos','Gasto','',null,3600),
    ('fijos','Servidor','',null,55),
    ('fijos','Coopel','',null,0)
  ) as v(section, concept, installment, total, amount);

  insert into public.fin_cuts (user_id, card, period, amount, paid)
  select uid, v.* from (values
    ('santander','13 ago a 12 sep',12714.37,6850),
    ('bbva','25 sep a 24 oct',0,0)
  ) as v(card, period, amount, paid);

  -- Primero los cargos y después los abonos, porque cada abono apunta a un cargo.
  insert into public.fin_debts (user_id, id, person, kind, concept, amount, date, applies_to)
  select uid, v.id::uuid, v.person, v.kind, v.concept, v.amount, v.date::date, v.applies_to::uuid from (values
    ('176759ea-c3ab-4a09-9575-ccf6539500bc','Ange','cargo','Tenis/Uñas / mercado libre crema / mercado libre protector / shein vestido',2870,'2026-08-04',null),
    ('ac05cd06-5cbf-42db-8f56-db3eb670a6c1','Ange','cargo','shein botas',428,'2026-10-14',null),
    ('10076056-9d3f-496e-92ee-04a70b54549d','Ange','cargo','ML pinturas',307,'2026-10-16',null),
    ('d5d81303-c986-44e7-b2bf-1eba70821626','Isma','cargo','Nintendo / Cargador nintendo, protectores',7000,'2026-07-05',null),
    ('10aafa9b-76fd-4e7b-81d0-a9a8f01496cb','Isma','cargo','Tenis mm',2599,'2026-08-31',null),
    ('e5cae379-15f1-4d36-b524-71dad89d22d7','mm','cargo','cremas',2000,'2026-08-20',null),
    ('69a74e3c-3a11-4ed6-98d7-68d09adb049c','YO','cargo','recarga',100,'2026-09-22',null),
    ('d77cfbab-60cc-4e43-908f-fac52452760d','YO','cargo','recarga a numero 7751098779',100,'2026-09-28',null),
    ('df045d15-0398-430e-be73-d8d5153b9598','YO','cargo','Amazon',419,'2026-09-29',null),
    ('550526a8-cc28-43a4-b3d4-212315108d41','YO','cargo','recarga a numero 726 184 0785',100,'2026-09-30',null),
    ('388b2477-c613-4432-afe8-18ca96ec06d9','YO','cargo','recarga a ella',100,'2026-10-05',null),
    ('c431dfdb-c64a-45aa-b657-b9b0a642dc78','YO','cargo','recarga 775 234 0356',100,'2026-10-08',null),
    ('8e5f7991-808e-41d4-bdc4-c6ec14723be8','YO','cargo','amazon VICKS',780,'2026-10-08',null),
    ('3e21735a-977c-4c65-b799-b9309a9f9a38','YO','cargo','2 recargas 100 775 150 4617 y 56 5860 0287',200,'2026-10-12',null),
    ('8fea696b-dea8-4c18-ad9e-d9e11339ea06','YO','cargo','Recarga 100 a ella',100,'2026-10-16',null),
    ('93ea8309-bc71-4de9-95e3-9d9b50aefefd','YOS','cargo','Restante de la vez pasada',3119,null,null),
    ('24223312-1922-40fc-904b-b64276218264','YOSS','cargo','1000 prestados',1000,'2026-10-06',null),
    ('7da689ad-a432-46b3-b544-2f6f11fcd65b','Ange','cargo','Shein botas',511,'2026-10-19',null),
    ('0754724e-fbdf-4c7f-abbf-bb4824772d89','YO','cargo','TKTK pans',240,'2026-10-20',null),
    ('ba2bf823-bfd9-441a-af07-936e78c53237','YO','cargo','Pans',204,'2026-10-21',null),
    ('54217051-3197-4b20-9b40-7c0af504ad66','Cele','cargo','rec',30,'2026-10-22',null),
    ('71a89e9c-cce5-4b5b-906b-2bfe6ce9f3e8','Ange','cargo','botas invierno',409,'2026-10-23',null)
  ) as v(id, person, kind, concept, amount, date, applies_to);

  insert into public.fin_debts (user_id, id, person, kind, concept, amount, date, applies_to)
  select uid, v.id::uuid, v.person, v.kind, v.concept, v.amount, v.date::date, v.applies_to::uuid from (values
    ('bc2c97a8-3f3e-42f4-9a99-2bd7d15ad854','Ange','abono','Pago',500,'2026-09-07','176759ea-c3ab-4a09-9575-ccf6539500bc'),
    ('29fb160c-4372-4395-9cb1-7b3e7325010f','Ange','abono','Pago',500,'2026-09-22','176759ea-c3ab-4a09-9575-ccf6539500bc'),
    ('52d24039-d42f-4a1f-b460-8d30380a13bd','Ange','abono','Pago',500,'2026-09-28','176759ea-c3ab-4a09-9575-ccf6539500bc'),
    ('6b8950b6-d71d-4e8c-b8db-6af337a97659','Ange','abono','Pago',1000,'2026-10-12','176759ea-c3ab-4a09-9575-ccf6539500bc'),
    ('7819dd60-0bea-4567-be06-4e3f73a7df36','Ange','abono','Pago',400,'2026-10-14','ac05cd06-5cbf-42db-8f56-db3eb670a6c1'),
    ('fa02466c-0a9c-443e-93f3-f536a3072c3c','Isma','abono','Pago',527,'2026-08-03','d5d81303-c986-44e7-b2bf-1eba70821626'),
    ('e662ef1e-2211-4686-82a4-0bde7b2a418c','Isma','abono','Pago Nintendo',1000,'2026-07-04','d5d81303-c986-44e7-b2bf-1eba70821626'),
    ('afe7d7c8-2b37-44ef-bf8d-86398d2df3c7','Isma','abono','Pago',195,'2026-09-12','d5d81303-c986-44e7-b2bf-1eba70821626'),
    ('36396009-2967-472e-b5b8-0bcd6fe9c76f','Isma','abono','Pago 1500',350,'2026-08-30','d5d81303-c986-44e7-b2bf-1eba70821626'),
    ('f33c95a4-e8dd-4b06-b858-30528bd860ff','Isma','abono','Pago 1000 , 200 recargas resto tenis',800,'2026-09-21','10aafa9b-76fd-4e7b-81d0-a9a8f01496cb'),
    ('240fa3fe-edef-47a2-bf76-f6915014719d','Isma','abono','Pago',1500,'2026-10-04','10aafa9b-76fd-4e7b-81d0-a9a8f01496cb'),
    ('2253dafa-5952-48db-aaae-ee6e608bc608','Isma','abono','1000',1000,'2026-10-19','d5d81303-c986-44e7-b2bf-1eba70821626'),
    ('10bdda8c-217d-453a-b6e6-b4dbdc48b14d','YOS','abono','Pago',500,'2025-02-11','93ea8309-bc71-4de9-95e3-9d9b50aefefd'),
    ('482bba3b-003f-45d4-9859-503ad4072c94','YOS','abono','Pago',500,'2026-03-11','93ea8309-bc71-4de9-95e3-9d9b50aefefd'),
    ('d46c706f-872a-42ea-8a45-e376a84f3f41','YOS','abono','Pago',1000,'2026-09-27','93ea8309-bc71-4de9-95e3-9d9b50aefefd'),
    ('e7c4a7e8-f3de-4fd8-b700-8272d232d970','Ange','abono','Pago shein botas',500,'2026-10-19','7da689ad-a432-46b3-b544-2f6f11fcd65b')
  ) as v(id, person, kind, concept, amount, date, applies_to);

  insert into public.fin_family (user_id, direction, name, date, amount)
  select uid, v.direction, v.name, v.date::date, v.amount from (values
    ('recibido','Transferencia','2026-01-09',1823),
    ('dado','Pablo (escalera)','2026-01-13',15000),
    ('recibido','Transferencia','2026-01-10',24710),
    ('dado','Tía Graciela','2026-01-13',3000),
    ('recibido','Transferencia','2026-04-21',17050),
    ('dado','Abuelita','2026-04-01',1000),
    ('recibido','Transferencia','2026-09-09',16670),
    ('dado','Abuelita','2026-04-19',1000),
    ('dado','Pablo','2026-04-19',4000),
    ('dado','Abuelita','2026-05-10',1500),
    ('dado','Abuelita','2026-05-30',5000),
    ('dado','Leydi Prestado','2026-07-03',4000),
    ('dado','Pablo','2026-08-04',500),
    ('dado','Abuelita','2026-08-26',1000),
    ('dado','Abuelita / Tio','2026-08-28',180),
    ('dado','Abuelita cumple','2026-09-16',2000),
    ('dado','Ang Caja','2026-09-23',500)
  ) as v(direction, name, date, amount);
end $$;
