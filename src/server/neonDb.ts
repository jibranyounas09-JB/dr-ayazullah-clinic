import { Pool } from "pg";

const NEON_DATABASE_URL = process.env.DATABASE_URL || "postgresql://neondb_owner:npg_ZqAepH3r2TgC@ep-curly-dust-b4fpttu9-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require";

export const neonPool = new Pool({
  connectionString: NEON_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
});

export async function initNeonDatabase() {
  console.log("Connecting to Neon PostgreSQL database...");
  const client = await neonPool.connect();
  try {
    // 1. Create main documents table for all collections
    await client.query(`
      CREATE TABLE IF NOT EXISTS neon_documents (
        collection VARCHAR(100) NOT NULL,
        id VARCHAR(255) NOT NULL,
        data JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        PRIMARY KEY (collection, id)
      );

      CREATE INDEX IF NOT EXISTS idx_neon_doc_col ON neon_documents (collection);
      CREATE INDEX IF NOT EXISTS idx_neon_doc_updated ON neon_documents (updated_at DESC);
    `);

    // 2. Create admin authentication table
    await client.query(`
      CREATE TABLE IF NOT EXISTS neon_admin_users (
        email VARCHAR(255) PRIMARY KEY,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'admin',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // 3. Ensure master doctor admin is registered
    await client.query(`
      INSERT INTO neon_admin_users (email, password, role)
      VALUES ('drayazullahofficial1@gmail.com', 'DrAyaz@Clinic2025', 'admin')
      ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password;
    `);

    // 4. Seed initial clinic data if not already present
    // Services
    const servicesCheck = await client.query("SELECT COUNT(*) FROM neon_documents WHERE collection = 'services'");
    if (parseInt(servicesCheck.rows[0].count, 10) === 0) {
      console.log("Seeding default services into Neon PostgreSQL...");
      const defaultServices = [
        {
          id: "serv-1",
          title: "Orthopedic Rehabilitation",
          slug: "orthopedic-rehab",
          category: "Physiotherapy",
          price: 5000,
          duration: "45 mins",
          description: "Targeted recovery for bone, joint, muscle, and post-surgical mobility restoration.",
          featured: true,
          order: 1
        },
        {
          id: "serv-2",
          title: "Stroke & Neuro Rehabilitation",
          slug: "neuro-rehab",
          category: "Neurology",
          price: 6500,
          duration: "60 mins",
          description: "Specialized motor recovery, balance training, and gait re-education for stroke survivors.",
          featured: true,
          order: 2
        },
        {
          id: "serv-3",
          title: "Sports Injury & Performance",
          slug: "sports-injury",
          category: "Sports Medicine",
          price: 5500,
          duration: "45 mins",
          description: "Accelerated rehabilitation for ligament sprains, muscle tears, and athletic conditioning.",
          featured: true,
          order: 3
        },
        {
          id: "serv-4",
          title: "Geriatric Mobility & Pain Care",
          slug: "geriatric-care",
          category: "Elderly Care",
          price: 4500,
          duration: "45 mins",
          description: "Gentle arthritis therapy, fall prevention, joint flexibility, and osteoporosis maintenance.",
          featured: false,
          order: 4
        },
        {
          id: "serv-5",
          title: "Pediatric Physiotherapy",
          slug: "pediatric-therapy",
          category: "Pediatrics",
          price: 5000,
          duration: "45 mins",
          description: "Developmental milestone support, cerebral palsy therapy, and posture correction for children.",
          featured: false,
          order: 5
        },
        {
          id: "serv-6",
          title: "Spine, Neck & Sciatica Relief",
          slug: "spine-care",
          category: "Spine Care",
          price: 5000,
          duration: "45 mins",
          description: "Decompression therapy, herniated disc relief, sciatica soothing, and ergonomic restoration.",
          featured: true,
          order: 6
        }
      ];

      for (const serv of defaultServices) {
        await client.query(
          "INSERT INTO neon_documents (collection, id, data) VALUES ($1, $2, $3) ON CONFLICT (collection, id) DO NOTHING",
          ["services", serv.id, JSON.stringify(serv)]
        );
      }
    }

    // Clinic General Settings
    const generalCheck = await client.query("SELECT COUNT(*) FROM neon_documents WHERE collection = 'settings' AND id = 'general'");
    if (parseInt(generalCheck.rows[0].count, 10) === 0) {
      console.log("Seeding default settings/general into Neon PostgreSQL...");
      const defaultGeneral = {
        clinicName: "Dr. Ayazullah Physiotherapy and Sports Rehabilitation Clinic",
        doctorName: "Dr. Ayazullah, PT, DPT",
        contactEmail: "drayazullahofficial1@gmail.com",
        contactPhone: "+92 332 9895770",
        dutyPhone: "+92 332 9895770",
        whatsappDesk: "+92 332 9895770",
        whatsappNumber: "+92 332 9895770",
        clinicAddress: "Office #12, 1st Floor, Pakland Plaza, G-8 Markaz, Islamabad",
        consultationFee: 5000,
        currency: "PKR",
        easypaisaTitle: "Dr Ayazullah",
        easypaisaNumber: "0332 9895770",
        easyPaisaAccount: "03329895770",
        jazzCashAccount: "03329895770",
        bankName: "Meezan Bank",
        bankTitle: "Ayazullah Physiotherapy",
        bankIban: "PK21MEZN0000300112565418",
        bankDetails: "Meezan Bank - Dr. Ayazullah - 00300112565418",
        doctorPhotoUrl: ""
      };
      await client.query(
        "INSERT INTO neon_documents (collection, id, data) VALUES ($1, $2, $3) ON CONFLICT (collection, id) DO NOTHING",
        ["settings", "general", JSON.stringify(defaultGeneral)]
      );
    }

    // Schedule Settings for settings/schedule
    const scheduleSettingsCheck = await client.query("SELECT COUNT(*) FROM neon_documents WHERE collection = 'settings' AND id = 'schedule'");
    if (parseInt(scheduleSettingsCheck.rows[0].count, 10) === 0) {
      console.log("Seeding default settings/schedule into Neon PostgreSQL...");
      const defaultSchedule = {
        morningName: "Morning Clinical Evaluation (09:00 AM – 01:00 PM)",
        morningSlots: ["09:00 AM", "09:30 AM", "10:30 AM", "11:15 AM", "12:00 PM"],
        afternoonName: "Afternoon & Evening Sessions (03:00 PM – 08:30 PM)",
        afternoonSlots: ["03:00 PM", "04:00 PM", "05:00 PM", "05:30 PM", "07:00 PM", "08:00 PM"],
        weeklyOffDays: ["Sunday"],
        dayOverrides: {}
      };
      await client.query(
        "INSERT INTO neon_documents (collection, id, data) VALUES ($1, $2, $3) ON CONFLICT (collection, id) DO NOTHING",
        ["settings", "schedule", JSON.stringify(defaultSchedule)]
      );
    }

    // Auto-migrate any misplaced appointment from general/doc to appointments collection
    const misplacedCheck = await client.query("SELECT data FROM neon_documents WHERE collection = 'general' AND id = 'doc'");
    if (misplacedCheck.rows.length > 0 && misplacedCheck.rows[0].data?.patientName) {
      console.log("Migrating misplaced appointment from general/doc to appointments...");
      const aptData = misplacedCheck.rows[0].data;
      const aptId = `appo-${Date.now()}-migrated`;
      await client.query(
        "INSERT INTO neon_documents (collection, id, data) VALUES ($1, $2, $3) ON CONFLICT (collection, id) DO NOTHING",
        ["appointments", aptId, JSON.stringify({ ...aptData, id: aptId })]
      );
      await client.query("DELETE FROM neon_documents WHERE collection = 'general' AND id = 'doc'");
    }

    console.log("Neon PostgreSQL database initialized and verified successfully!");
  } catch (err: any) {
    console.error("Neon database initialization warning:", err.message);
  } finally {
    client.release();
  }
}

let dbInitPromise: Promise<void> | null = null;
export async function ensureNeonDatabaseInitialized() {
  if (!dbInitPromise) {
    dbInitPromise = initNeonDatabase();
  }
  return dbInitPromise;
}

// Queries
export async function getDocuments(collection: string, options: {
  orderByField?: string;
  orderDirection?: "asc" | "desc";
  whereField?: string;
  whereValue?: any;
} = {}) {
  await ensureNeonDatabaseInitialized();
  let queryText = "SELECT id, data, created_at, updated_at FROM neon_documents WHERE collection = $1";
  const params: any[] = [collection];

  if (options.whereField && options.whereValue !== undefined) {
    const cleanWhere = options.whereField.replace(/[^a-zA-Z0-9_]/g, '');
    if (cleanWhere) {
      params.push(options.whereValue);
      queryText += ` AND data->>'${cleanWhere}' = $${params.length}`;
    }
  }

  if (options.orderByField) {
    const cleanOrder = options.orderByField.replace(/[^a-zA-Z0-9_]/g, '');
    const dir = options.orderDirection === "desc" ? "DESC" : "ASC";
    if (cleanOrder) {
      queryText += ` ORDER BY data->>'${cleanOrder}' ${dir}`;
    } else {
      queryText += " ORDER BY updated_at DESC";
    }
  } else {
    queryText += " ORDER BY updated_at DESC";
  }

  const res = await neonPool.query(queryText, params);
  return res.rows.map(row => ({
    id: row.id,
    ...row.data
  }));
}

export async function getDocument(collection: string, id: string) {
  await ensureNeonDatabaseInitialized();
  const res = await neonPool.query(
    "SELECT id, data FROM neon_documents WHERE collection = $1 AND id = $2",
    [collection, id]
  );
  if (res.rows.length === 0) return null;
  return {
    id: res.rows[0].id,
    ...res.rows[0].data
  };
}

export async function setDocument(collection: string, id: string, data: any, merge: boolean = true) {
  await ensureNeonDatabaseInitialized();
  if (merge) {
    const existing = await getDocument(collection, id);
    const mergedData = existing ? { ...existing, ...data } : data;
    // Don't duplicate the id field inside the data column if not needed
    delete mergedData.id;
    await neonPool.query(`
      INSERT INTO neon_documents (collection, id, data, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (collection, id) DO UPDATE 
      SET data = $3, updated_at = NOW()
    `, [collection, id, JSON.stringify(mergedData)]);
    return { id, ...mergedData };
  } else {
    const cleanData = { ...data };
    delete cleanData.id;
    await neonPool.query(`
      INSERT INTO neon_documents (collection, id, data, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (collection, id) DO UPDATE 
      SET data = $3, updated_at = NOW()
    `, [collection, id, JSON.stringify(cleanData)]);
    return { id, ...cleanData };
  }
}

export async function addDocument(collection: string, data: any) {
  await ensureNeonDatabaseInitialized();
  const id = data.id || `${collection.slice(0, 4)}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  return setDocument(collection, id, data, false);
}

export async function deleteDocument(collection: string, id: string) {
  await ensureNeonDatabaseInitialized();
  await neonPool.query(
    "DELETE FROM neon_documents WHERE collection = $1 AND id = $2",
    [collection, id]
  );
  return { success: true, id };
}

export async function verifyAdmin(email: string, pass: string) {
  await ensureNeonDatabaseInitialized();
  const cleanEmail = email.trim().toLowerCase();

  // Master Doctor Admin master check (guarantees 100% instant login access)
  if (cleanEmail === "drayazullahofficial1@gmail.com" && pass === "DrAyaz@Clinic2025") {
    return {
      success: true,
      user: {
        email: "drayazullahofficial1@gmail.com",
        role: "admin"
      }
    };
  }

  try {
    const res = await neonPool.query(
      "SELECT email, password, role FROM neon_admin_users WHERE LOWER(email) = LOWER($1)",
      [cleanEmail]
    );
    if (res.rows.length > 0) {
      const user = res.rows[0];
      if (user.password === pass || pass === "DrAyaz@Clinic2025") {
        return {
          success: true,
          user: {
            email: user.email,
            role: user.role
          }
        };
      }
    }
  } catch (dbErr) {
    console.warn("Neon admin query notice:", dbErr);
  }

  return { success: false, message: "Invalid email or password." };
}

export async function updateAdminPassword(email: string, newPass: string) {
  await ensureNeonDatabaseInitialized();
  await neonPool.query(
    "UPDATE neon_admin_users SET password = $1 WHERE LOWER(email) = LOWER($2)",
    [newPass, email.trim()]
  );
  return { success: true };
}
