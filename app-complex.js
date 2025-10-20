const { useState, useRef, useEffect, useMemo, useCallback, memo } = React;
const e = React.createElement;

// ERROR BOUNDARY
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('❌ REACT ERROR:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return e('div', {
        style: {
          padding: '40px',
          background: '#1e1e1e',
          color: '#ff453a',
          fontFamily: 'monospace',
          height: '100vh'
        }
      },
        e('h1', null, '❌ React Virhe:'),
        e('pre', { style: { color: '#fff', marginTop: '20px' } },
          this.state.error ? this.state.error.toString() : 'Unknown error'
        )
      );
    }
    return this.props.children;
  }
}

// AI Story Architect GENIUS Component
const AIStoryArchitectGenius = ({ project, setProject, isDarkMode }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [conversation, setConversation] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [currentPhase, setCurrentPhase] = useState('initial');
  const [storyModel, setStoryModel] = useState({
    genre: null,
    subgenre: null,
    emotionalCore: null,
    tensionPair: null,
    coreConflict: null,
    themes: [],
    atmosphere: null,
    narrativeVoice: null
  });

  // Genre detection patterns
  const detectGenre = (text) => {
    const patterns = {
      horror: {
        keywords: ['pelko', 'kauhu', 'pimeä', 'varjo', 'kuolema', 'aave', 'demoni', 'painajainen', 'hirviö'],
        subgenres: ['psykologinen kauhu', 'kosminen kauhu', 'goottilainen kauhu', 'kehokauhu'],
        themes: ['hulluus', 'eristäytyneisyys', 'muodonmuutos', 'todellisuuden hajoaminen']
      },
      scifi: {
        keywords: ['tulevaisuus', 'avaruus', 'robotti', 'tekoäly', 'planeetta', 'teknologia', 'aika', 'ulottuvuus'],
        subgenres: ['dystopia', 'kyberpunk', 'space opera', 'aikamatkustus', 'biopunk'],
        themes: ['ihmisyys', 'identiteetti', 'teknologian vaikutus', 'vapaa tahto']
      },
      fantasy: {
        keywords: ['taikuus', 'magia', 'loitsu', 'lohikäärme', 'velho', 'kuningaskunta', 'miekka', 'keiju'],
        subgenres: ['high fantasy', 'urban fantasy', 'dark fantasy', 'mytologinen fantasy'],
        themes: ['hyvä vs paha', 'sankarin matka', 'voima ja vastuu', 'kohtalo']
      },
      mystery: {
        keywords: ['murha', 'mysteeri', 'salainen', 'tutkia', 'rikos', 'etsivä', 'arvoitus', 'todiste'],
        subgenres: ['cozy mystery', 'noir', 'poliisiromaani', 'psykologinen trilleri'],
        themes: ['totuus', 'oikeudenmukaisuus', 'petos', 'syyllisyys']
      },
      romance: {
        keywords: ['rakkaus', 'sydän', 'suudelma', 'kaipaus', 'intohimo', 'sielunkumppani', 'romantiikka'],
        subgenres: ['historiallinen romantiikka', 'paranormaali romantiikka', 'romanttinen komedia'],
        themes: ['rakkaus', 'luottamus', 'uhraus', 'anteeksianto']
      },
      literary: {
        keywords: ['muisti', 'identiteetti', 'merkitys', 'olemassaolo', 'ihmisyys', 'yhteiskunta', 'filosofia'],
        subgenres: ['eksistentialistinen', 'postmoderni', 'realistinen', 'maaginen realismi'],
        themes: ['kuolevaisuus', 'merkityksen etsintä', 'vieraantuminen', 'muisti ja aika']
      }
    };

    const lowerText = text.toLowerCase();
    let bestMatch = { genre: 'literary', score: 1 }; // Default fallback

    for (const [genre, data] of Object.entries(patterns)) {
      const score = data.keywords.filter(k => lowerText.includes(k)).length;
      if (score > bestMatch.score) {
        bestMatch = { genre, score, data };
      }
    }

    return bestMatch;
  };

  // Emotional core detection
  const detectEmotionalCore = (text) => {
    const emotions = {
      'pelko ja turvallisuus': ['pelko', 'turvallinen', 'suojella', 'uhka', 'vaara'],
      'rakkaus ja menetys': ['rakkaus', 'menettää', 'kaipaus', 'ikävä', 'ero'],
      'valta ja vapaus': ['valta', 'vapaus', 'kontrolli', 'hallita', 'pakko'],
      'identiteetti ja muutos': ['minä', 'kuka', 'muuttua', 'tulla', 'olla'],
      'syyllisyys ja sovitus': ['syyllinen', 'anteeksi', 'katua', 'virhe', 'sovittaa'],
      'yksinäisyys ja yhteys': ['yksin', 'yhdessä', 'kaveri', 'ystävä', 'eristää']
    };

    const lowerText = text.toLowerCase();
    let bestMatch = null;
    let maxScore = 0;

    for (const [core, keywords] of Object.entries(emotions)) {
      const score = keywords.filter(k => lowerText.includes(k)).length;
      if (score > maxScore) {
        maxScore = score;
        bestMatch = core;
      }
    }

    return bestMatch || 'tuntematon konflikti';
  };

  // Generate genre-specific questions
  const generateGenreQuestions = (genre, subgenre, phase) => {
    const questions = {
      horror: {
        initial: [
          "Mikä on tarinan keskeinen pelko tai uhka? Onko se konkreettinen vai psykologinen?",
          "Miten päähenkilö kohtaa tämän pelon ensimmäisen kerran?",
          "Mikä tekee juuri tästä pelosta erityisen henkilökohtaisen päähenkilölle?"
        ],
        development: [
          "Miten pelko eskaloituu? Muuttuuko sen luonne tarinan edetessä?",
          "Mitkä ovat päähenkilön heikkoudet, joita pelko hyödyntää?",
          "Onko tarinassa hetkeä, jolloin lukija epäilee päähenkilön mielenterveyttä?"
        ],
        climax: [
          "Mikä on se hetki, jolloin päähenkilö ymmärtää pelon todellisen luonteen?",
          "Voiko päähenkilö voittaa pelon, vai onko kyse selviytymisestä?",
          "Mitä päähenkilö joutuu uhraamaan selvitäkseen?"
        ]
      },
      scifi: {
        initial: [
          "Mikä teknologinen tai tieteellinen elementti on tarinan keskiössä?",
          "Miten tämä elementti vaikuttaa yhteiskuntaan tai yksilöön?",
          "Mikä on tarinan maailman suurin ero meidän maailmaamme?"
        ],
        development: [
          "Mitä eettisiä kysymyksiä teknologia/tiede nostaa esiin?",
          "Kuka hyötyy tästä teknologiasta ja kuka kärsii?",
          "Onko teknologia ratkaisu vai ongelma - vai molempia?"
        ],
        climax: [
          "Mikä on se valinta, jonka päähenkilö joutuu tekemään teknologian suhteen?",
          "Miten ihmisyys määritellään uudelleen tarinan lopussa?",
          "Onko tulevaisuus toiveikas vai varoittava?"
        ]
      },
      fantasy: {
        initial: [
          "Mikä on tarinan maailman maaginen systeemi tai voima?",
          "Mikä on päähenkilön suhde tähän magiaan?",
          "Mikä uhka tai epätasapaino uhkaa maailmaa?"
        ],
        development: [
          "Miten päähenkilö oppii hallitsemaan voimaansa/kohtalonsa?",
          "Kuka on antagonisti ja mikä motivoi häntä?",
          "Mitä päähenkilön täytyy uhrata saavuttaakseen tavoitteensa?"
        ],
        climax: [
          "Mikä on se suuri taistelu tai koetus, joka ratkaisee kaiken?",
          "Miten päähenkilö ylittää itsensä?",
          "Muuttuuko maailma pysyvästi tarinan seurauksena?"
        ]
      },
      mystery: {
        initial: [
          "Mikä on keskeisin mysteeri tai rikos?",
          "Miksi juuri päähenkilö ryhtyy selvittämään sitä?",
          "Mikä on ensimmäinen johtolanka?"
        ],
        development: [
          "Mitkä ovat harhaanjohtavat johtolangat?",
          "Kuka vaikuttaa syylliseltä mutta ei ole?",
          "Mikä paljastus muuttaa kaiken?"
        ],
        climax: [
          "Mikä on se pieni yksityiskohta, joka paljastaa totuuden?",
          "Miten syyllinen paljastetaan?",
          "Mitä päähenkilö oppii itsestään tutkimuksen aikana?"
        ]
      },
      romance: {
        initial: [
          "Miten päähenkilöt kohtaavat ensimmäisen kerran?",
          "Mikä estää heitä olemasta heti yhdessä?",
          "Mikä tekee heistä täydellisen parin?"
        ],
        development: [
          "Mikä on se hetki, jolloin he ymmärtävät rakastuvansa?",
          "Mikä ulkoinen tai sisäinen konflikti uhkaa heidän rakkauttaan?",
          "Miten he muuttuvat toistensa vaikutuksesta?"
        ],
        climax: [
          "Mikä on se suuri ele tai uhraus, joka todistaa rakkauden?",
          "Miten he ylittävät viimeisen esteen?",
          "Millainen on heidän yhteinen tulevaisuutensa?"
        ]
      },
      literary: {
        initial: [
          "Mikä on päähenkilön keskeinen sisäinen konflikti?",
          "Miten ulkomaailma heijastaa tätä sisäistä kamppailua?",
          "Mikä tapahtuma käynnistää päähenkilön muutoksen?"
        ],
        development: [
          "Mitä symboleja tai metaforia käytät kuvaamaan päähenkilön matkaa?",
          "Miten menneisyys vaikuttaa nykyhetkeen?",
          "Mikä on se totuus, jota päähenkilö pakenee?"
        ],
        climax: [
          "Mikä on se oivallus, joka muuttaa päähenkilön käsityksen itsestään?",
          "Hyväksyykö päähenkilö todellisuuden vai jatkaako illuusiossa?",
          "Mitä lukijalle jää pohdittavaksi?"
        ]
      }
    };

    return questions[genre]?.[phase] || questions.literary[phase];
  };

  // Process user input with deep analysis
  const handleUserInput = async () => {
    if (!userInput.trim()) return;

    const userMessage = userInput.trim();
    setUserInput('');
    setIsThinking(true);

    // Add user message
    setConversation(prev => [...prev, { role: 'user', content: userMessage }]);

    // Simulate AI processing
    setTimeout(() => {
      let aiResponse = '';

      if (currentPhase === 'initial') {
        // First interaction - analyze the story idea
        const genreMatch = detectGenre(userMessage);
        const emotionalCore = detectEmotionalCore(userMessage);

        setStoryModel(prev => ({
          ...prev,
          genre: genreMatch.genre,
          emotionalCore: emotionalCore,
          subgenre: genreMatch.data?.subgenres?.[0] || 'yleinen'
        }));

        aiResponse = `🎭 **Genre-analyysi valmis!**\n\n`;
        aiResponse += `Tunnistin tarinasi ytimeksi: **${genreMatch.genre}**\n`;
        aiResponse += `Emotionaalinen ydin: **${emotionalCore}**\n\n`;

        aiResponse += `Tämä on mielenkiintoinen lähtökohta! `;

        // Genre-specific initial response
        const genreResponses = {
          horror: "Pelko on voimakas tarinankerronnallinen väline. Tutkitaan, miten voimme tehdä siitä henkilökohtaisen ja viskeraalisen.",
          scifi: "Tieteisfiktiossa voimme tutkia mitä ihmisyys tarkoittaa muuttuvassa maailmassa.",
          fantasy: "Fantasiamaailmat antavat meille vapauden tutkia universaaleja teemoja uudessa kontekstissa.",
          mystery: "Mysteerit pitävät lukijan koukussa. Rakennetaan kerrostunutta arvoitusta.",
          romance: "Rakkaustarinassa tunne-elämän dynamiikka on kaiken ydin.",
          literary: "Kirjallinen fiktio antaa tilaa syvälliselle psykologiselle tutkiskelulle."
        };

        aiResponse += genreResponses[genreMatch.genre] || genreResponses.literary;
        aiResponse += "\n\n**Syvennetään tarinaa näillä kysymyksillä:**\n\n";

        // Add genre-specific questions
        const questions = generateGenreQuestions(genreMatch.genre, null, 'initial');
        questions.forEach((q, i) => {
          aiResponse += `${i + 1}. ${q}\n`;
        });

        aiResponse += `\nVastaa vapaasti - voit käsitellä yhden tai useamman kysymyksen. Näiden pohjalta rakennamme tarinalle vahvan rungon.`;

        setCurrentPhase('development');
      } else if (currentPhase === 'development') {
        // Development phase - dig deeper based on genre
        const genre = storyModel.genre;

        aiResponse = `📖 **Erinomaista! Tarina syvenee.**\n\n`;
        aiResponse += `Näen että tarinasi ${storyModel.emotionalCore} -teema alkaa hahmottua.\n\n`;

        // Genre-specific development
        const developmentPrompts = {
          horror: [
            "Mietitään pelon eskalaatiota:",
            "• Miten pelko muuttuu abstraktista konkreettiseksi?",
            "• Mikä on se hetki, jolloin paluuta ei ole?",
            "• Miten ympäristö muuttuu uhkaavaksi?"
          ],
          scifi: [
            "Tutkitaan maailmanrakennusta:",
            "• Mitkä ovat yhteiskunnan säännöt?",
            "• Miten teknologia vaikuttaa jokapäiväiseen elämään?",
            "• Ketkä ovat vallassa ja miksi?"
          ],
          fantasy: [
            "Syvennetään maagista systeemiä:",
            "• Mitkä ovat magian säännöt ja rajoitukset?",
            "• Mitä magia maksaa käyttäjällel?",
            "• Miten maailman historia vaikuttaa nykyhetkeen?"
          ],
          mystery: [
            "Rakennetaan jännitettä:",
            "• Kuka voisi olla syyllinen ja miksi?",
            "• Mitä todisteet näyttävät sanovan?",
            "• Mikä on se vale, jonka kaikki uskovat?"
          ],
          romance: [
            "Kehitetään tunnedynamiikkaa:",
            "• Mikä on hahmojen suurin pelko rakkauden suhteen?",
            "• Miten he täydentävät toisiaan?",
            "• Mikä voisi erottaa heidät lopullisesti?"
          ],
          literary: [
            "Syvennytään temaattisesti:",
            "• Miten päähenkilön sisäinen ja ulkoinen maailma peilaavat toisiaan?",
            "• Mikä on tarina tarinan sisällä?",
            "• Mitä symboliikkaa käytät?"
          ]
        };

        const prompts = developmentPrompts[genre] || developmentPrompts.literary;
        prompts.forEach(p => {
          aiResponse += p + '\n';
        });

        aiResponse += `\n**Seuraavat askeleet:**\n`;

        const questions = generateGenreQuestions(genre, storyModel.subgenre, 'development');
        questions.forEach((q, i) => {
          aiResponse += `${i + 1}. ${q}\n`;
        });

        setCurrentPhase('climax');
      } else {
        // Climax/resolution phase
        aiResponse = `🎯 **Tarinan ydin on valmis!**\n\n`;
        aiResponse += `Olemme rakentaneet ${storyModel.genre}-tarinan, `;
        aiResponse += `jonka emotionaalinen ydin on "${storyModel.emotionalCore}".\n\n`;

        aiResponse += `**Tarinan rakenne:**\n`;
        aiResponse += `• Alku: Konfliktin esittely\n`;
        aiResponse += `• Keskikohta: Jännitteen eskalaatio\n`;
        aiResponse += `• Loppu: Ratkaisun löytäminen\n\n`;

        aiResponse += `**Voit nyt:**\n`;
        aiResponse += `1. Pyytää minulta tarkempia kysymyksiä jostakin osa-alueesta\n`;
        aiResponse += `2. Kertoa lisää ideoitasi ja saat lisää palautetta\n`;
        aiResponse += `3. Aloittaa kirjoittamisen tämän rungon pohjalta\n\n`;

        aiResponse += `Muista: ${storyModel.genre}-genressä `;
        const genreTips = {
          horror: "tunnelman rakentaminen on yhtä tärkeää kuin juoni.",
          scifi: "maailman sisäinen logiikka täytyy olla johdonmukainen.",
          fantasy: "magian säännöt määrittävät konfliktien ratkaisut.",
          mystery: "jokaisen johtolangan täytyy olla rehellinen lukijalle.",
          romance: "kemian täytyy tuntua aidolta ja ansaitulta.",
          literary: "temaattinen resonanssi on tärkeämpää kuin juonen käänteet."
        };

        aiResponse += genreTips[storyModel.genre] || genreTips.literary;

        setCurrentPhase('complete');
      }

      setConversation(prev => [...prev, { role: 'ai', content: aiResponse }]);
      setIsThinking(false);
    }, 1500 + Math.random() * 1000);
  };

  return e('div', null,
    // Trigger button
    e('button', {
      onClick: () => setIsOpen(true),
      className: 'fixed bottom-8 right-8 bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-4 rounded-full shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all z-50',
      title: 'AI Story Architect GENIUS'
    },
      e('div', { className: 'flex items-center gap-2' },
        e('span', { className: 'text-2xl' }, '🧠'),
        e('span', { className: 'font-bold' }, 'AI Genius')
      )
    ),

    // Main dialog
    isOpen && e('div', { className: 'fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4' },
      e('div', { className: `w-full max-w-5xl h-5/6 rounded-xl shadow-2xl flex flex-col ${isDarkMode ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'}` },
        // Header
        e('div', { className: `p-6 border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}` },
          e('div', { className: 'flex justify-between items-center' },
            e('div', null,
              e('h2', { className: 'text-2xl font-bold flex items-center gap-2' },
                e('span', null, '🧠'),
                e('span', null, 'AI Story Architect GENIUS')
              ),
              e('p', { className: 'text-sm opacity-75 mt-1' }, 'Genreälykäs tarinan kehitysjärjestelmä')
            ),
            e('button', {
              onClick: () => setIsOpen(false),
              className: 'p-2 hover:bg-gray-700 rounded-lg transition'
            }, '✕')
          )
        ),

        // Conversation area
        e('div', { className: 'flex-1 overflow-y-auto p-6' },
          conversation.length === 0 ? e('div', { className: 'text-center py-12' },
            e('div', { className: 'text-6xl mb-6' }, '🜍'),
            e('h3', { className: 'text-xl font-bold mb-4' }, 'Adaptiivinen tarinan kehitysjärjestelmä'),
            e('p', { className: 'max-w-2xl mx-auto mb-8 opacity-75' },
              'Tämä AI ymmärtää kirjallisuuden lajityyppejä syvällisesti. Se tunnistaa tarinan emotionaalisen ytimen, jänniteparin ja genren - ja mukauttaa kysymyksensä niiden mukaan.'
            ),
            e('div', { className: `text-left max-w-3xl mx-auto p-6 rounded-lg ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}` },
              e('p', { className: 'font-bold mb-3' }, '🎭 Kerro ideasi vapaasti, esimerkiksi:'),
              e('ul', { className: 'space-y-2 text-sm opacity-90' },
                e('li', null, '• "Haluan kirjoittaa tarinan naisesta, joka näkee peilissä eri ihmisen"'),
                e('li', null, '• "Tarina sijoittuu tulevaisuuteen, jossa muistot voi ostaa"'),
                e('li', null, '• "Päähenkilö haluaa kostaa, mutta pelkää muuttuvansa vihollisekseen"'),
                e('li', null, '• "Kaksi ihmistä rakastuu, vaikka tietävät toisen olevan illuusio"')
              ),
              e('p', { className: 'mt-4 text-xs italic' },
                'Järjestelmä tunnistaa genren ja muokkaa kysymykset sen mukaan. Psykologinen kauhu saa erilaisia kysymyksiä kuin romantiikka.'
              )
            )
          ) : e('div', { className: 'space-y-4' },
            conversation.map((msg, idx) => e('div', { key: idx, className: msg.role === 'user' ? 'text-right' : 'text-left' },
              e('div', { className: `inline-block max-w-3/4 p-4 rounded-lg ${msg.role === 'user' ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white' : (isDarkMode ? 'bg-gray-800' : 'bg-gray-100')}` },
                msg.role === 'ai' && e('div', { className: 'flex items-center gap-2 mb-2 font-semibold' },
                  e('span', null, '🧠'),
                  e('span', null, 'AI Genius')
                ),
                e('div', { className: 'whitespace-pre-wrap' }, msg.content)
              )
            )),

            isThinking && e('div', { className: 'text-left' },
              e('div', { className: `inline-block p-4 rounded-lg ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}` },
                e('div', { className: 'flex items-center gap-2' },
                  e('div', { className: 'animate-spin h-4 w-4 border-2 border-purple-500 border-t-transparent rounded-full' }),
                  e('span', null, 'Analysoin syvällisesti...')
                )
              )
            )
          )
        ),

        // Input area
        e('div', { className: `p-4 border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}` },
          e('div', { className: 'flex gap-2' },
            e('textarea', {
              value: userInput,
              onChange: (e) => setUserInput(e.target.value),
              onKeyDown: (e) => {
                if (e.key === 'Enter' && e.ctrlKey && !isThinking) {
                  handleUserInput();
                }
              },
              placeholder: currentPhase === 'initial' ? 'Kuvaile tarinasi idea vapaasti...' : 'Vastaa kysymyksiin tai jatka ideointia...',
              className: `flex-1 p-3 rounded-lg resize-none h-20 ${isDarkMode ? 'bg-gray-800 text-white placeholder-gray-500' : 'bg-gray-100 text-gray-900 placeholder-gray-400'}`,
              disabled: isThinking
            }),
            e('button', {
              onClick: handleUserInput,
              disabled: !userInput.trim() || isThinking,
              className: `px-6 py-3 rounded-lg font-semibold transition ${userInput.trim() && !isThinking ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white hover:shadow-lg' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`
            }, 'Lähetä')
          ),
          e('p', { className: 'text-xs opacity-50 mt-2' }, 'Ctrl+Enter lähettää • AI tunnistaa genren ja mukauttaa kysymykset')
        )
      )
    )
  );
};

// MAIN COMPONENT - KirjoitusStudio
const KirjoitusStudio = () => {
  const [project, setProject] = useState(null);
  const [scheme, setScheme] = useState('light');

  return e(AIStoryArchitectGenius, {
    project: project,
    setProject: setProject,
    isDarkMode: scheme === 'dark'
  });
};

// RENDER
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  e(ErrorBoundary, null,
    e(KirjoitusStudio)
  )
);
