import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import crypto from 'crypto'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

const newVenues = [
  { name: "Burt's Bar", address: "629 Richmond St", type: "bars" },
  { name: "Crabby Joe's", address: "276 Dundas St", type: "eats" },
  { name: "London Ale House", address: "288 Dundas St", type: "bars" },
  { name: "Milos Craft Beer Emporium", address: "420 Talbot St", type: "bars" },
  { name: "Runt Club", address: "153 Albert St", type: "bars" },
  { name: "Supply & Demand", address: "420 Talbot St", type: "bars" },
  { name: "The Mule", address: "523 Richmond St", type: "eats" },
  { name: "Vice Supper Club", address: "89 King St", type: "clubs" },
  { name: "Tabu Nightclub", address: "539 Richmond St", type: "clubs" },
  { name: "Lost Love Social", address: "153 Carling St", type: "clubs" }
]

async function geocodeAndInsert() {
  for (const v of newVenues) {
    try {
      console.log(`Geocoding ${v.name}...`)
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(v.address + ", London, Ontario")}`, {
        headers: { 'User-Agent': 'DTL-Nightly-Admin/1.0' }
      })
      const data = await res.json()
      
      let lat = 42.9849;
      let lng = -81.2453;
      
      if (data && data.length > 0) {
        lat = parseFloat(data[0].lat)
        lng = parseFloat(data[0].lon)
      }

      const { error } = await supabase
        .from('venues')
        .insert({
          id: crypto.randomUUID(),
          name: v.name,
          address: v.address,
          description: "London, Ontario venue.",
          type: v.type,
          location: `POINT(${lng} ${lat})`
        })

      if (error) {
        console.error(`Error inserting ${v.name}:`, error)
      } else {
        console.log(`Inserted ${v.name} at ${lat}, ${lng}`)
      }
      
      await new Promise(resolve => setTimeout(resolve, 1500))
    } catch (err) {
      console.error(`Exception on ${v.name}:`, err)
    }
  }
}

geocodeAndInsert()
