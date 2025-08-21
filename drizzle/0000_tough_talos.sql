CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"phone" text NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contacts_phone_e164_chk" CHECK (phone ~ '^\+\d{10,15}$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_phone_uq" ON "contacts" USING btree ("phone");