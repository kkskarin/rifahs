-- When the balance on a part-paid / unpaid manual order is due.
alter table public.orders add column if not exists payment_due_date date;
