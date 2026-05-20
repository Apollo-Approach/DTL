const ADJECTIVES = [
  'Generous', 'Purple', 'Funky', 'Happy', 'Brave', 'Clever', 'Bright', 'Cool',
  'Wild', 'Silent', 'Swift', 'Gentle', 'Loyal', 'Magic', 'Noble', 'Proud',
  'Quick', 'Sharp', 'Smart', 'Solid', 'Sweet', 'Vivid', 'Warm', 'Wise',
  'Shiny', 'Lucky', 'Golden', 'Silver', 'Cosmic', 'Stellar', 'Wavy', 'Zesty'
];

const NOUNS = [
  'Sloth', 'Panda', 'Tiger', 'Eagle', 'Shark', 'Dolphin', 'Lion', 'Bear',
  'Wolf', 'Fox', 'Hawk', 'Owl', 'Deer', 'Frog', 'Toad', 'Snake',
  'Dragon', 'Unicorn', 'Phoenix', 'Griffin', 'Kraken', 'Yeti', 'Orca', 'Rhino',
  'Hippo', 'Moose', 'Camel', 'Llama', 'Alpaca', 'Koala', 'Lemur', 'Badger'
];

export function generatePassCode(): string {
  const adj1 = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const adj2 = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  
  return `${adj1}-${adj2}-${noun}`;
}
