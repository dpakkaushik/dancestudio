import { DOS_STYLE_NAMES } from "./styles";

/** WHAT A DANCE STYLE IS — the Styles section on Discover and each style's own
 *  page (2 Oct 2026, the user: "New section in discover called Styles. All dance
 *  styles cards on this page with a photo of that particular dance style. page
 *  opens dance style — column 1: Photos, info, History, country, and Notable
 *  names — max 5 names, column 2 rankings for that particular dance style").
 *
 *  The prototype's style page (`StylePage`, 9432-9544) holds this kind of record
 *  for eight styles in an `INFO` map and a generic sentence for every other one;
 *  this is that map, written out for all 49 in the registry.
 *
 *  ⚠ EVERY NAME IS A WIDELY DOCUMENTED FIGURE IN THAT FORM, and where a date is a
 *  range or a tradition the field says so — an encyclopedia line that cannot be
 *  checked is worse than a shorter one. ⚠ At most FIVE names, the user's number.
 *  ⚠ The PICTURE is not here: since 2 Oct 2026 every style is a drawn dancer
 *  (`lib/styleArt/specs.ts`), which replaced the Commons photos. */
export interface StyleInfo {
  /** the family the registry groups it under */
  family: string;
  origin: string;
  country: string;
  era: string;
  history: string[];
  notable: string[];
}

export const styleSlug = (style: string): string =>
  style.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const BY_SLUG = new Map(DOS_STYLE_NAMES.map((s) => [styleSlug(s), s]));
/** the style a slug names, or null — a URL is a request, the registry decides */
export const styleFromSlug = (slug: string): string | null => BY_SLUG.get(slug) ?? null;

const IC = "Indian classical";
const IF = "Indian folk";
const ST = "Street";
const GS = "Global street";
const LA = "Latin";
const BR = "Ballroom";
const SD = "Studio";
const WO = "World";
const FO = "Fitness & open";

export const STYLE_INFO: Record<string, StyleInfo> = {
  Bharatanatyam: {
    family: IC, origin: "Tamil Nadu — the temples of Thanjavur", country: "India", era: "Rooted in the Natya Shastra; codified in its modern form in the 19th century",
    history: [
      "The oldest of India's classical forms, built on the principles of the Natya Shastra treatise on performance.",
      "Danced in araimandi — a half-seated posture held through the piece — with precise footwork and hand gestures (mudras).",
      "Combines nritta (pure rhythm), nritya (expression) and natya (drama); a first full solo recital is called the arangetram.",
      "Brought from temple and court to the modern stage in the 20th century, largely through Rukmini Devi Arundale's Kalakshetra.",
    ],
    notable: ["Rukmini Devi Arundale", "T. Balasaraswati", "Alarmel Valli", "Malavika Sarukkai", "Padma Subrahmanyam"],
  },
  Kathak: {
    family: IC, origin: "North India — Uttar Pradesh and Rajasthan", country: "India", era: "Storyteller roots; refined in the Mughal and Rajput courts from the 1500s",
    history: [
      "Named after katha, 'story': its first dancers were storytellers travelling between temples.",
      "Known for fast spins (chakkars), intricate footwork with ankle bells, and expressive storytelling (abhinaya).",
      "Its three main schools, or gharanas, are Lucknow, Jaipur and Banaras, each with its own emphasis.",
    ],
    notable: ["Birju Maharaj", "Sitara Devi", "Kumudini Lakhia", "Shovana Narayan", "Saswati Sen"],
  },
  Kathakali: {
    family: IC, origin: "Kerala", country: "India", era: "Emerged in the 17th century",
    history: [
      "A dance-drama telling stories from the Mahabharata and Ramayana, traditionally performed through the night.",
      "Famous for its elaborate make-up and costumes; the colour of a face tells you the kind of character.",
      "Performers train for years in eye and facial control; the story is carried by gesture, with singers and drummers alongside.",
      "Kerala Kalamandalam, founded in 1930 by the poet Vallathol Narayana Menon, made it a modern institution.",
    ],
    notable: ["Kalamandalam Gopi", "Kalamandalam Krishnan Nair", "Kalamandalam Ramankutty Nair", "Vallathol Narayana Menon"],
  },
  Kuchipudi: {
    family: IC, origin: "Kuchipudi village, Andhra Pradesh", country: "India", era: "Dance-drama tradition from around the 17th century",
    history: [
      "Named after the village where Brahmin families kept it alive as a dance-drama tradition.",
      "Mixes fast rhythm with expressive storytelling; a well-known piece is danced on the rim of a brass plate.",
      "Siddhendra Yogi is credited with shaping it; Vempati Chinna Satyam reworked it as a solo stage form in the 20th century.",
    ],
    notable: ["Vempati Chinna Satyam", "Yamini Krishnamurthy", "Raja and Radha Reddy", "Shobha Naidu", "Swapnasundari"],
  },
  Manipuri: {
    family: IC, origin: "Manipur", country: "India", era: "Rooted in Lai Haraoba ritual; Ras Lila form from the 18th century",
    history: [
      "Gentle, rounded and devotional — the dancer's feet rarely strike the floor hard.",
      "The Ras Lila, telling the story of Radha and Krishna, is its best-known form, with its distinctive barrel-shaped skirt.",
      "Rabindranath Tagore brought it to Santiniketan in the 1920s, helping carry it beyond Manipur.",
    ],
    notable: ["Guru Bipin Singh", "Jhaveri Sisters", "Guru Amubi Singh", "Darshana Jhaveri"],
  },
  Mohiniyattam: {
    family: IC, origin: "Kerala", country: "India", era: "Classical form shaped in the 19th century",
    history: [
      "Named after Mohini, the enchantress form of Vishnu — the dance of the enchantress.",
      "Swaying, circular movements and graceful expression, traditionally danced by women in white and gold.",
      "Revived in the 20th century at Kerala Kalamandalam after a period of decline.",
    ],
    notable: ["Kalamandalam Kalyanikutty Amma", "Bharati Shivaji", "Kanak Rele", "Sunanda Nair"],
  },
  Odissi: {
    family: IC, origin: "Odisha", country: "India", era: "Temple roots over 2,000 years old; reconstructed in the 1950s",
    history: [
      "One of the oldest surviving dance forms, traced through temple sculpture in Odisha.",
      "Built on tribhangi — the body bent in three places — and the square chauka stance.",
      "Reconstructed by gurus in the 1950s from temple traditions (maharis) and boy dancers (gotipuas).",
    ],
    notable: ["Kelucharan Mohapatra", "Sanjukta Panigrahi", "Sonal Mansingh", "Protima Bedi", "Madhavi Mudgal"],
  },
  Sattriya: {
    family: IC, origin: "Assam — the Vaishnava monasteries (sattras)", country: "India", era: "Founded in the 15th–16th century; recognised as classical in 2000",
    history: [
      "Created by the saint Srimanta Sankardev as part of devotional performances in Assam's monasteries.",
      "For centuries it was danced by monks in the sattras; it moved onto public stages in the 20th century.",
      "Recognised by the Sangeet Natak Akademi as one of India's classical dances in 2000.",
    ],
    notable: ["Srimanta Sankardev", "Jatin Goswami", "Sharodi Saikia", "Anwesa Mahanta"],
  },
  "Semi-classical": {
    family: IC, origin: "Across India", country: "India", era: "20th century onward",
    history: [
      "Draws on classical technique — footwork, mudras, expression — but frees it from strict repertoire and rules.",
      "Common in films, stage shows and school performances, often set to film or devotional music.",
      "A popular first step for dancers who later choose a single classical form.",
    ],
    notable: ["Vyjayanthimala", "Hema Malini", "Madhuri Dixit", "Waheeda Rehman"],
  },
  Bhangra: {
    family: IF, origin: "Punjab", country: "India / Pakistan", era: "Harvest dance; stage form from the 1950s",
    history: [
      "Began as a celebration of the harvest around Vaisakhi in the Punjab region.",
      "Driven by the dhol drum, with high-energy jumps, shoulder movements and shouted calls.",
      "Spread worldwide with the Punjabi diaspora, especially through UK bhangra music from the 1980s.",
    ],
    notable: ["Gurdas Maan", "Malkit Singh", "Daler Mehndi", "Panjabi MC"],
  },
  Garba: {
    family: IF, origin: "Gujarat", country: "India", era: "Devotional tradition danced at Navratri",
    history: [
      "Danced in circles around a lamp or an image of the goddess Durga during the nine nights of Navratri.",
      "The circle stands for the cycle of life; clapping and turning steps repeat in rising tempo.",
      "Now danced across India and the diaspora, in huge Navratri gatherings.",
    ],
    notable: ["Falguni Pathak", "Atul Purohit", "Kirtidan Gadhvi"],
  },
  "Dandiya Raas": {
    family: IF, origin: "Gujarat and Rajasthan", country: "India", era: "Navratri tradition",
    history: [
      "Danced with pairs of decorated sticks (dandiyas) struck together in rhythm.",
      "Often linked with the playful dance of Krishna and the gopis in Vrindavan.",
      "Usually danced alongside garba during Navratri, in pairs that rotate around a circle.",
    ],
    notable: ["Falguni Pathak", "Preeti Pinky"],
  },
  Ghoomar: {
    family: IF, origin: "Rajasthan", country: "India", era: "Traditional, linked with the Bhil community and the Rajput courts",
    history: [
      "Named after ghoomna, 'to twirl' — dancers turn so their long ghagra skirts flare out.",
      "Traditionally danced by women at festivals and weddings, with faces veiled.",
      "Associated with the Bhil tribe and later adopted by Rajasthan's royal households.",
    ],
    /* ⚠ left empty rather than guessed: no single dancer is the documented name of this form */
    notable: [],
  },
  Kalbelia: {
    family: IF, origin: "Rajasthan — the Kalbelia community", country: "India", era: "Traditional; on UNESCO's intangible heritage list since 2010",
    history: [
      "Danced by the Kalbelia, a community historically known as snake charmers.",
      "Its fluid, swirling movements are often compared to a serpent's.",
      "Inscribed on UNESCO's list of the intangible cultural heritage of humanity in 2010.",
    ],
    notable: ["Gulabo Sapera"],
  },
  Lavani: {
    family: IF, origin: "Maharashtra", country: "India", era: "Popular from the 18th century, in the Peshwa era",
    history: [
      "A powerful, rhythmic form set to the beat of the dholki drum.",
      "Mixes song and dance; performers wear nine-yard sarees and dance with sharp, teasing expression.",
      "Long performed in tamasha folk theatre, and a staple of Marathi cinema.",
    ],
    notable: ["Surekha Punekar", "Sandhya Shantaram", "Madhu Kambikar"],
  },
  Bihu: {
    family: IF, origin: "Assam", country: "India", era: "Folk tradition tied to the Bihu festivals",
    history: [
      "Danced at Rongali Bihu, Assam's spring and new-year festival in April.",
      "Quick steps, hip movement and raised hands, to the dhol, pepa (buffalo-horn pipe) and gogona.",
      "Danced by young men and women, often in the traditional mekhela chador.",
    ],
    notable: ["Bhupen Hazarika", "Zubeen Garg"],
  },
  Giddha: {
    family: IF, origin: "Punjab", country: "India / Pakistan", era: "Traditional women's dance",
    history: [
      "The women's counterpart to bhangra, danced at festivals, weddings and Teeyan.",
      "Built on clapping and short sung couplets (boliyan) that are often witty or teasing.",
      "Performed in a circle, with dancers stepping into the middle in turn.",
    ],
    notable: ["Surinder Kaur", "Gurmeet Bawa"],
  },
  "Sufi Whirling": {
    family: IF, origin: "Konya, Anatolia (present-day Turkey)", country: "Turkey", era: "13th century, from the order founded after Rumi",
    history: [
      "The sema of the Mevlevi order, founded by followers of the poet Jalaluddin Rumi.",
      "Dancers turn on one foot, one palm raised and one lowered — a form of prayer.",
      "The Mevlevi sema is on UNESCO's list of intangible cultural heritage; in India it is seen at Sufi shrines and festivals.",
    ],
    notable: ["Jalaluddin Rumi", "Sultan Walad"],
  },
  Bollywood: {
    family: "Bollywood", origin: "Hindi film industry, Mumbai", country: "India", era: "From the 1930s; modern form from the 1990s",
    history: [
      "A fusion style: classical mudras, folk energy, jazz lines and hip-hop can all appear in one number.",
      "Made for the camera — expression and storytelling matter as much as the steps.",
      "The style most Indians first learn, and the backbone of wedding sangeet choreography.",
    ],
    notable: ["Saroj Khan", "Farah Khan", "Prabhu Deva", "Remo D'Souza", "Madhuri Dixit"],
  },
  /* added 11 Oct 2026 at the user's word ("Add Bolly-Hop as a dance style") */
  "Bolly-Hop": {
    family: "Bollywood", origin: "Indian dance studios and film choreography", country: "India", era: "From the 2000s",
    history: [
      "Bollywood's expression and filmi storytelling danced on hip-hop grooves, bounce and isolations.",
      "Grew out of studio classes and reality-TV choreography, where film songs met street foundations.",
      "Danced to Hindi film tracks and remixes — common in sangeet sets, showcases and competition routines.",
    ],
    notable: [],
  },
  "Hip-Hop": {
    family: ST, origin: "The Bronx, New York City", country: "United States", era: "Early 1970s",
    history: [
      "Born at Bronx block parties where DJs looped the instrumental breaks so dancers could keep going.",
      "One of four original elements of hip-hop culture: DJing, MCing, graffiti and breaking.",
      "Foundations include grooves, bounce, rock and isolations, danced freestyle in a cypher or set to choreography.",
    ],
    notable: ["DJ Kool Herc", "Afrika Bambaataa", "Buddha Stretch", "Marjory Smarth"],
  },
  Breaking: {
    family: ST, origin: "The Bronx, New York City", country: "United States", era: "1970s",
    history: [
      "Named for the 'break' in a record — the part dancers waited for.",
      "Built on four parts: toprock, footwork, power moves and freezes.",
      "Judged in battles and cyphers; it made its Olympic debut at Paris 2024.",
    ],
    notable: ["Crazy Legs", "Ken Swift", "Frosty Freeze", "Bboy Lilou", "Bgirl Ami"],
  },
  Popping: {
    family: ST, origin: "Fresno and Oakland, California", country: "United States", era: "Late 1970s",
    history: [
      "Based on quickly contracting and releasing muscles so the body appears to 'pop' on the beat.",
      "Grew from Boogaloo in Oakland and was popularised by the Electric Boogaloos from Fresno.",
      "Includes related techniques such as waving, ticking and robotting.",
    ],
    notable: ["Boogaloo Sam", "Popin' Pete", "Mr. Wiggles", "Poppin' John"],
  },
  Locking: {
    family: ST, origin: "Los Angeles", country: "United States", era: "Late 1960s – early 1970s",
    history: [
      "Created by Don Campbell, whose habit of freezing mid-move became the 'lock'.",
      "Playful and theatrical: points, wrist rolls, skeeter rabbits and big smiles.",
      "Spread through the TV show Soul Train and the group The Lockers.",
    ],
    notable: ["Don Campbell", "Shabba-Doo", "Skeeter Rabbit", "Greg 'Campbellock Jr.' Pope"],
  },
  House: {
    family: ST, origin: "Chicago and New York clubs", country: "United States", era: "1980s",
    history: [
      "Danced to house music in clubs, centred on fast, flowing footwork.",
      "Mixes jacking (a rolling upper-body groove), footwork and lofting, which takes the dance to the floor.",
      "Shaped by influences from tap, salsa, capoeira and African dance.",
    ],
    notable: ["Marjory Smarth", "Ejoe Wilson", "Brian 'Footwork' Green", "Caleaf Sellers"],
  },
  Waacking: {
    family: ST, origin: "Los Angeles gay clubs", country: "United States", era: "1970s, disco era",
    history: [
      "Built on fast arm rotations and poses, danced to disco music.",
      "Created in LA's gay clubs, where it was first called punking.",
      "Seen by millions on Soul Train, and revived worldwide from the 2000s.",
    ],
    notable: ["Tyrone Proctor", "Jeffrey Daniel", "Princess Lockerooo"],
  },
  Krump: {
    family: ST, origin: "South Central Los Angeles", country: "United States", era: "Early 2000s",
    history: [
      "Grew out of clowning, created by Tommy the Clown, and was taken further by Tight Eyez and Big Mijo.",
      "Raw, energetic and expressive: chest pops, stomps and arm swings.",
      "Brought to wide audiences by the 2005 documentary Rize.",
    ],
    notable: ["Tight Eyez", "Big Mijo", "Miss Prissy", "Tommy the Clown"],
  },
  Dancehall: {
    family: GS, origin: "Kingston", country: "Jamaica", era: "Late 1970s – 1980s",
    history: [
      "Danced to dancehall music, born in Jamaica's street parties and sound-system culture.",
      "Every move has a name, often created by a dancer and spread through a song.",
      "Known for its grounded bounce, sharp knees and humour.",
    ],
    notable: ["Bogle", "Ding Dong", "John Hype", "Shelly Belly"],
  },
  Afrobeats: {
    family: GS, origin: "Lagos and Accra", country: "Nigeria / Ghana", era: "2000s onward",
    history: [
      "Danced to Afrobeats, the West African pop sound that went global in the 2010s.",
      "Draws on traditional West African movement and spreads through viral dance trends.",
      "Moves like Azonto, Shaku Shaku and Zanku were each named and popularised by a song.",
    ],
    notable: ["Poco Lee", "Kaffy", "Dancegod Lloyd"],
  },
  Reggaeton: {
    family: GS, origin: "Puerto Rico and Panama", country: "Puerto Rico / Panama", era: "1990s",
    history: [
      "Danced to reggaeton, which grew from reggae en español and Latin hip-hop.",
      "Built on the dembow rhythm, with hip movement and grounded steps.",
      "Went worldwide in the 2000s and again with Latin pop in the 2010s.",
    ],
    notable: ["Daddy Yankee", "Bad Bunny", "J Balvin"],
  },
  "K-pop": {
    family: GS, origin: "Seoul", country: "South Korea", era: "1990s onward",
    history: [
      "The choreography of Korean pop groups — tight, synchronised and built to be filmed.",
      "Mixes hip-hop, jazz and pop styles with signature 'point' moves for each song.",
      "Cover-dance groups now learn and perform it on stages and streets around the world.",
    ],
    notable: ["Lia Kim", "Rie Hata", "BTS's choreographer Son Sung-deuk"],
  },
  Salsa: {
    family: LA, origin: "Caribbean roots, shaped in New York City", country: "Cuba / Puerto Rico / United States", era: "1960s–70s",
    history: [
      "Grew from Cuban son, mambo and Puerto Rican rhythms in New York's Latin neighbourhoods.",
      "Danced 'on 1' (LA style) or 'on 2' (New York style); Cuban casino is danced in a circle.",
      "A lead-and-follow partner dance, the centre of India's social-dance nights.",
    ],
    notable: ["Eddie Torres", "Frankie Martinez", "Johnny Vazquez", "Celia Cruz"],
  },
  Bachata: {
    family: LA, origin: "Dominican Republic", country: "Dominican Republic", era: "1960s",
    history: [
      "Danced to bachata music, first seen as music of the poor and later embraced nationally.",
      "A basic of four beats — three steps and a tap — with hip movement.",
      "Sensual bachata, a modern partner style developed in Spain, spread worldwide from the 2000s.",
    ],
    notable: ["Juan Luis Guerra", "Romeo Santos", "Korke and Judith"],
  },
  Samba: {
    family: LA, origin: "Rio de Janeiro and Bahia", country: "Brazil", era: "Late 19th – early 20th century",
    history: [
      "Rooted in Afro-Brazilian traditions brought from West Africa.",
      "Samba no pé is the fast solo footwork seen at Rio's carnival parades.",
      "There is also a ballroom version, one of the five dances of international Latin.",
    ],
    notable: ["Carmen Miranda", "Valéria Valenssa"],
  },
  Ballroom: {
    family: BR, origin: "European courts and dance halls", country: "United Kingdom (standardised)", era: "Standardised in the early 20th century",
    history: [
      "Partner dances standardised in England into competition styles: Standard and Latin.",
      "Standard includes the waltz, quickstep, foxtrot, tango and Viennese waltz.",
      "Judged on posture, timing, footwork and partnering at competitions around the world.",
    ],
    notable: ["Victor Silvester", "Marcus and Karen Hilton", "Arunas Bizokas"],
  },
  Tango: {
    family: BR, origin: "Buenos Aires and Montevideo", country: "Argentina / Uruguay", era: "Late 19th century",
    history: [
      "Born in the working-class neighbourhoods along the Río de la Plata.",
      "Argentine tango is improvised, in a close embrace, danced to tango orchestras.",
      "Listed by UNESCO as intangible cultural heritage in 2009.",
    ],
    notable: ["Carlos Gardel", "Astor Piazzolla", "Juan Carlos Copes", "María Nieves"],
  },
  Contemporary: {
    family: SD, origin: "United States and Europe", country: "United States / Germany", era: "Mid-20th century",
    history: [
      "Grew from modern dance as a move away from ballet's fixed vocabulary.",
      "Uses gravity, breath and the floor: release, fall and recovery, spirals and contact.",
      "Has no single syllabus; each choreographer builds their own language.",
    ],
    notable: ["Merce Cunningham", "Pina Bausch", "Akram Khan", "Crystal Pite", "Astad Deboo"],
  },
  Modern: {
    family: SD, origin: "United States and Germany", country: "United States / Germany", era: "Early 20th century",
    history: [
      "Began as a rebellion against classical ballet's rules.",
      "Each pioneer built a technique: Graham's contraction and release, Humphrey's fall and recovery.",
      "Uday Shankar fused Indian dance with modern ideas, taking it to world stages in the 1930s.",
    ],
    notable: ["Isadora Duncan", "Martha Graham", "Doris Humphrey", "José Limón", "Uday Shankar"],
  },
  Jazz: {
    family: SD, origin: "African-American communities in the United States", country: "United States", era: "Late 19th – early 20th century",
    history: [
      "Grew from African-American social dances alongside jazz music.",
      "Shaped for stage and screen by Broadway and Hollywood choreographers.",
      "Known for isolations, kicks, turns and high energy.",
    ],
    notable: ["Jack Cole", "Bob Fosse", "Katherine Dunham", "Luigi", "Gus Giordano"],
  },
  "Jazz Funk": {
    family: SD, origin: "Los Angeles studios", country: "United States", era: "2000s",
    history: [
      "A blend of jazz technique with hip-hop attitude and groove.",
      "Built for pop music and music-video choreography, often with strong character and style.",
      "Popular in commercial dance classes across studios worldwide.",
    ],
    notable: ["Brian Friedman", "Tricia Miranda", "Laurieann Gibson"],
  },
  Ballet: {
    family: SD, origin: "Italian Renaissance courts, developed in France", country: "Italy / France", era: "15th–17th century",
    history: [
      "Born in Italian courts and codified in France, which is why its terms are French.",
      "Built on turnout, pointed feet, and precise positions and lines.",
      "Major schools include the Vaganova (Russian), Cecchetti (Italian) and Royal Academy (British) methods.",
    ],
    notable: ["Anna Pavlova", "Rudolf Nureyev", "Margot Fonteyn", "Mikhail Baryshnikov", "Misty Copeland"],
  },
  Tap: {
    family: SD, origin: "United States", country: "United States", era: "19th century",
    history: [
      "Grew from Irish step dancing and African dance traditions meeting in America.",
      "Dancers wear shoes with metal plates and use their feet as percussion.",
      "Became a stage and film star through vaudeville and Hollywood musicals.",
    ],
    notable: ["Bill 'Bojangles' Robinson", "The Nicholas Brothers", "Gregory Hines", "Savion Glover", "Fred Astaire"],
  },
  Lyrical: {
    family: SD, origin: "United States dance studios", country: "United States", era: "Late 20th century",
    history: [
      "A blend of ballet and jazz that interprets the words and feeling of a song.",
      "Flowing movement, leaps and turns, with emotion at the centre.",
      "Grew through competition dance and studio training.",
    ],
    notable: ["Mia Michaels", "Travis Wall", "Sonya Tayeh"],
  },
  Commercial: {
    family: SD, origin: "Music videos, tours and TV", country: "Global", era: "1980s onward",
    history: [
      "The choreography of pop music — music videos, concert tours and TV shows.",
      "Mixes hip-hop, jazz and other styles, built for the camera and the crowd.",
      "Dancers often train in several styles to work in the industry.",
    ],
    notable: ["Michael Jackson", "Paula Abdul", "Parris Goebel", "Laurieann Gibson"],
  },
  Heels: {
    family: SD, origin: "Studio and commercial dance", country: "United States", era: "2000s",
    history: [
      "Choreography danced in high heels, borrowing from jazz, jazz funk and commercial dance.",
      "Focuses on confidence, balance, lines and attitude.",
      "Spread widely through pop music videos and studio classes.",
    ],
    notable: ["Yanis Marshall", "Brinn Nicole"],
  },
  Flamenco: {
    family: WO, origin: "Andalusia", country: "Spain", era: "18th–19th century",
    history: [
      "Grew from the Romani people of Andalusia together with local and Moorish influences.",
      "Brings together song (cante), guitar (toque), dance (baile) and handclaps (palmas).",
      "Listed by UNESCO as intangible cultural heritage in 2010.",
    ],
    notable: ["Carmen Amaya", "Antonio Gades", "Joaquín Cortés", "Sara Baras", "Paco de Lucía"],
  },
  "Belly Dance": {
    family: WO, origin: "The Middle East and North Africa", country: "Egypt / Turkey", era: "Ancient roots; stage form in the 20th century",
    history: [
      "Known in Arabic as raqs sharqi, 'oriental dance'.",
      "Isolations of the hips, chest and arms, with shimmies and undulations.",
      "Its stage style was shaped in 20th-century Cairo nightclubs and films.",
    ],
    notable: ["Samia Gamal", "Tahia Carioca", "Nagwa Fouad", "Dina"],
  },
  Zumba: {
    family: FO, origin: "Cali", country: "Colombia", era: "1990s",
    history: [
      "Created by Colombian fitness instructor Alberto 'Beto' Pérez when he improvised a class to Latin music.",
      "Combines dance moves from salsa, merengue, reggaeton and more into a workout.",
      "Now taught in gyms worldwide, in Zumba-licensed classes.",
    ],
    notable: ["Alberto 'Beto' Pérez"],
  },
  Freestyle: {
    family: FO, origin: "Street and club culture", country: "Global", era: "Ongoing",
    history: [
      "Dance that is improvised in the moment, without set choreography.",
      "Central to battles and cyphers across street styles.",
      "Draws on a dancer's training in any style and their own musicality.",
    ],
    notable: [],
  },
  "Open format": {
    family: FO, origin: "Dance battles and competitions", country: "Global", era: "Ongoing",
    history: [
      "Any style can be danced — a category used in battles and competitions.",
      "Dancers from different backgrounds compete against each other on musicality and creativity.",
      "Encourages mixing styles and personal expression.",
    ],
    notable: [],
  },
};

/** THE ORDER OF THE STYLES SHELF (2 Oct 2026, the user: "mix order of dance
 *  styles as all classical infront"). Every Indian classical form first, in the
 *  registry's order, then the rest MIXED — one from each family in turn, so the
 *  shelf does not read as nine blocks of the same kind of dance. ⚠ Deterministic:
 *  the same order on every load, so a style is where you left it. */
export function stylesShelfOrder(): string[] {
  const classical = DOS_STYLE_NAMES.filter((s) => styleInfo(s).family === IC);
  const byFamily = new Map<string, string[]>();
  for (const s of DOS_STYLE_NAMES) {
    const f = styleInfo(s).family;
    if (f === IC) continue;
    byFamily.set(f, [...(byFamily.get(f) ?? []), s]);
  }
  const queues = [...byFamily.values()];
  const mixed: string[] = [];
  while (queues.some((q) => q.length)) for (const q of queues) if (q.length) mixed.push(q.shift() as string);
  return [...classical, ...mixed];
}

/** a style's record, or a plain one for anything the map has not been told about */
export const styleInfo = (style: string): StyleInfo =>
  STYLE_INFO[style] ?? { family: "Dance", origin: "Passed between communities", country: "Global", era: "Traditional", history: ["A living tradition carried by teachers, crews and competitions."], notable: [] };

/** the families, in registry order — Discover's FAMILY filter (2 Oct 2026) */
export const STYLE_FAMILIES: readonly string[] = [...new Set(DOS_STYLE_NAMES.map((s) => styleInfo(s).family))];
/** the styles of these families, in registry order */
export const stylesOfFamilies = (fams: readonly string[]): string[] => DOS_STYLE_NAMES.filter((s) => fams.includes(styleInfo(s).family));
