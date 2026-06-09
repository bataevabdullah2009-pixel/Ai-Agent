const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function createLead({ chat_id, name, business_name, business_type, city, phone, notes }) {
  const { data, error } = await supabase
    .from('leads')
    .insert({
      chat_id,
      name: name || null,
      business_name: business_name || null,
      business_type: business_type || null,
      city: city || null,
      phone: phone || null,
      notes: notes || null,
      status: 'new'
    })
    .select()
    .single();

  if (error) {
    console.error('Supabase insert error:', error.message);
    return null;
  }

  return data;
}

module.exports = { createLead };
