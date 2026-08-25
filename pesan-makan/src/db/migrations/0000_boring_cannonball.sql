CREATE TYPE "public"."session_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" text PRIMARY KEY NOT NULL,
	"warung_id" text NOT NULL,
	"nama_item" text NOT NULL,
	"harga" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"menu_item_id" text NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"nama_pemesan" text NOT NULL,
	"catatan" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"warung_id" text NOT NULL,
	"tanggal" date DEFAULT now() NOT NULL,
	"status" "session_status" DEFAULT 'open' NOT NULL,
	"nama_penagih" text,
	"nama_bank" text,
	"no_rekening" text,
	"biaya_tambahan" integer DEFAULT 0 NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warungs" (
	"id" text PRIMARY KEY NOT NULL,
	"nama" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_warung_id_warungs_id_fk" FOREIGN KEY ("warung_id") REFERENCES "public"."warungs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_warung_id_warungs_id_fk" FOREIGN KEY ("warung_id") REFERENCES "public"."warungs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "menu_items_warung_nama_idx" ON "menu_items" USING btree ("warung_id","nama_item");--> statement-breakpoint
CREATE UNIQUE INDEX "order_items_order_menu_idx" ON "order_items" USING btree ("order_id","menu_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_session_nama_idx" ON "orders" USING btree ("session_id","nama_pemesan");