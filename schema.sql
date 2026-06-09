CREATE TABLE IF NOT EXISTS leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id BIGINT NOT NULL,
  name TEXT,
  business_name TEXT,
  business_type TEXT,
  city TEXT,
  phone TEXT,
  notes TEXT,
  status TEXT DEFAULT 'new',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_leads_chat_id ON leads(chat_id);
CREATE INDEX idx_leads_status ON leads(status);
