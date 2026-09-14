'use strict';

/**
 * doubtEngine.js — Astra's offline VOICE_CHAT_MODE brain.
 *
 * A curated, exam-focused knowledge base of the doubts JEE/NEET students
 * actually ask, plus "pinpoint" remediation used when a student says
 * "I didn't get step 2" mid-lecture.
 *
 * Every answer obeys the VOICE_CHAT_MODE contract:
 *   { mode, spokenResponse, uiDisplay:{mathHint, actionableTip}, followUpPrompt }
 *
 * spokenResponse is written for TTS: no LaTeX, symbols spoken out loud.
 */

const SCHEMA = {
  lecture: {
    mode: 'LECTURE',
    topic: '<string>',
    targetExam: '<JEE Advanced | JEE Main | NEET>',
    slides: [
      {
        slideNumber: 1,
        title: '<string>',
        content: {
          bullets: ['<string>'],
          latexFormulas: ['<string>'],
          keyTakeaway: '<string>',
        },
        voiceScript: "<string: spoken text for TTS, formulas written phonetically: 'F equals m a'>",
      },
    ],
  },
  voiceChat: {
    mode: 'VOICE_CHAT',
    spokenResponse: '<string: max 3-4 sentences, natural for TTS>',
    uiDisplay: {
      mathHint: '<string: exact LaTeX equation or diagram note>',
      actionableTip: '<string: shortcut or exam trap warning>',
    },
    followUpPrompt: '<string: short check-understanding question>',
  },
};

/* ------------------------------------------------------------------ *
 * Knowledge base
 * ------------------------------------------------------------------ */

const RULES = [
  /* --------------------------- PHYSICS --------------------------- */
  {
    id: 'phy.sign-convention',
    subject: 'Physics',
    topic: 'Kinematics — sign convention & gravity',
    keywords: ['sign convention', 'negative g', 'g negative', 'gravity negative', 'plus minus', 'sign of acceleration', 'upward positive'],
    spoken:
      "Sign convention is a choice you make once, then never break. Pick upward as positive, and immediately gravity becomes minus g, because it pulls down. A ball thrown up has positive velocity while rising and negative velocity while falling, but its acceleration stays minus 9.8 the whole time, even at the top.",
    mathHint: '$a=-g=-9.8\\ \\mathrm{m/s^2}$ always, once "up" is chosen positive',
    tip: 'Trap: students set v = 0 at the top and also a = 0. Acceleration is never zero in free fall — that is the single most common JEE Main negative-marking source in kinematics.',
    followUp: 'So at the highest point, what are v and a — can you say both in one line?',
  },
  {
    id: 'phy.relative-velocity',
    subject: 'Physics',
    topic: 'Relative velocity — river & rain problems',
    keywords: ['relative velocity', 'river boat', 'boat river', 'rain umbrella', 'man on train', 'v ab', 'relative motion', 'crossing river', 'shortest path'],
    spoken:
      "Relative velocity is just subtraction with a strict order: velocity of A with respect to B equals velocity of A minus velocity of B. For river problems, the boat's own velocity is what the engine gives, and the river adds its drift on top. To cross by the shortest path you aim upstream so that the resultant points straight across.",
    mathHint: '$\\vec v_{AB}=\\vec v_A-\\vec v_B$; shortest path when $\\vec v_{BR}+\\vec v_R$ is $\\perp$ to the bank',
    tip: 'Shortcut: minimum crossing time is always width divided by boat speed in still water, and that happens when you head straight across — the drift does not affect the time at all.',
    followUp: 'If the river gets faster, does the crossing time change, or only the drift?',
  },
  {
    id: 'phy.graph-slope-area',
    subject: 'Physics',
    topic: 'Motion graphs — slope vs area',
    keywords: ['slope of graph', 'area under graph', 'v t graph', 'velocity time graph', 'x t graph', 'position time graph', 'area under curve', 'graph question'],
    spoken:
      "Read the axes first, that is the whole trick. On a position–time graph the slope is velocity. On a velocity–time graph the slope is acceleration and the area under the curve is displacement, with area below the time axis counted as negative.",
    mathHint: '$v=\\dfrac{dx}{dt}$ (slope of $x$–$t$), $\\;a=\\dfrac{dv}{dt}$, $\\;\\Delta x=\\int v\\,dt$ (area of $v$–$t$)',
    tip: 'Trap: area of a v–t graph gives displacement, not distance. For total distance travelled, add the absolute values of the areas above and below the axis.',
    followUp: 'A v–t graph dips below the axis and comes back — what does the total area tell you?',
  },
  {
    id: 'phy.fbd-normal',
    subject: 'Physics',
    topic: 'Newton\u2019s laws — free body diagrams & normal reaction',
    keywords: ['free body diagram', 'fbd', 'normal reaction', 'normal force', 'newton second law', 'third law pair', 'action reaction', 'tension in string', 'pulley', 'constraint'],
    spoken:
      "Draw one body, alone, and put on it only the forces that other objects apply to it. Normal reaction is always perpendicular to the surface of contact, never vertical by default. Newton's third law pairs always act on two different bodies, so they never cancel inside a single free body diagram.",
    mathHint: '$\\sum \\vec F_{\\text{on body}} = m\\vec a$; third-law pair $\\vec F_{AB}=-\\vec F_{BA}$ acts on different bodies',
    tip: 'Exam trap: on an incline, resolve weight into mg sin\u03b8 along the plane and mg cos\u03b8 into the plane. N = mg cos\u03b8 only when there is no other vertical force and no acceleration perpendicular to the plane.',
    followUp: 'Want to sketch the free body diagram of a block on an incline together, force by force?',
  },
  {
    id: 'phy.pseudo-force',
    subject: 'Physics',
    topic: 'Non-inertial frames & pseudo force',
    keywords: ['pseudo force', 'pseudo', 'non inertial', 'noninertial', 'accelerating frame', 'lift elevator', 'elevator problem', 'frame of reference'],
    spoken:
      "A pseudo force appears only when you solve the problem from an accelerating frame. Its magnitude is mass times the acceleration of the frame, and its direction is opposite to that acceleration. In a lift accelerating upward, you feel heavier because you add m a downward on top of m g.",
    mathHint: '$\\vec F_{\\text{pseudo}}=-m\\vec a_{\\text{frame}}$; lift: apparent weight $N=m(g+a)$ up, $m(g-a)$ down',
    tip: 'Shortcut: in lift problems, just replace g by g plus a for upward acceleration and g minus a for downward. Free fall means a = g, so apparent weight is zero.',
    followUp: 'If the lift cable snaps, what does the weighing machine read — and why?',
  },
  {
    id: 'phy.friction',
    subject: 'Physics',
    topic: 'Friction — static, limiting & kinetic',
    keywords: ['friction', 'static friction', 'kinetic friction', 'limiting friction', 'coefficient of friction', 'mu', 'angle of friction', 'friction direction'],
    spoken:
      "Static friction is a self-adjusting force: it gives exactly what is needed to stop relative motion, up to a ceiling of mu s times normal reaction. Once sliding starts, kinetic friction takes over and it is slightly smaller and essentially constant. Friction always opposes relative motion or the tendency of it, between the two surfaces in contact — not motion itself.",
    mathHint: '$f_s\\le \\mu_s N$, $f_{s,\\max}=\\mu_s N$ (limiting), $f_k=\\mu_k N$, and $\\mu_k<\\mu_s$',
    tip: 'Trap: use f = \u03bcN only at the limiting case or during sliding. For a block at rest on a rough floor pushed with 5 N, friction is 5 N, not \u03bcN.',
    followUp: 'A block sits on a rough incline and slowly the angle is raised — at what angle does it just start to slide?',
  },
  {
    id: 'phy.work-energy',
    subject: 'Physics',
    topic: 'Work–energy theorem & conservation of energy',
    keywords: ['work energy theorem', 'work done', 'conservation of energy', 'kinetic energy', 'potential energy', 'negative work', 'zero work', 'power'],
    spoken:
      "Work is the dot product of force and displacement, so only the component of force along the motion counts. The work–energy theorem says the net work done by all forces equals the change in kinetic energy. Conservation of mechanical energy works only when the non-conservative forces do zero work.",
    mathHint: '$W=\\vec F\\cdot\\vec s=Fs\\cos\\theta$, $\\;W_{\\text{net}}=\\Delta K$, $\\;K+U=\\text{const}$ if $W_{nc}=0$',
    tip: 'Shortcut: for variable force, W = integral of F dot dx, and it equals the area under an F–x graph. Power is F dot v — the fastest route in vehicle and elevator questions.',
    followUp: 'When a ball falls with air resistance, why is the gain in kinetic energy less than m g h?',
  },
  {
    id: 'phy.centripetal',
    subject: 'Physics',
    topic: 'Circular motion & centripetal force',
    keywords: ['centripetal', 'centrifugal', 'circular motion', 'banking of road', 'loop the loop', 'vertical circle', 'angular velocity'],
    spoken:
      "Centripetal force is not a new kind of force, it is a job description. Whatever net force points toward the centre plays that role: tension in a string, friction on a turning car, gravity for a satellite. Because it is always perpendicular to the instantaneous velocity, it changes the direction of motion but never the speed, so it does zero work.",
    mathHint: '$F_c=\\dfrac{mv^2}{r}=m\\omega^2 r$, directed along $-\\hat r$; $W_c=0$ since $\\vec F_c\\perp\\vec v$',
    tip: 'Trap: never add "centripetal force" as a separate arrow in a free body diagram. For a vertical circle, the minimum speed at the top is root g r and at the bottom root 5 g r.',
    followUp: 'At the top of a vertical loop, which two forces together supply m v squared over r?',
  },
  {
    id: 'phy.shm',
    subject: 'Physics',
    topic: 'Simple harmonic motion',
    keywords: ['shm', 'simple harmonic', 'oscillation', 'time period', 'pendulum', 'spring mass', 'amplitude', 'phase', 'restoring force'],
    spoken:
      "Simple harmonic motion needs one condition: a restoring force proportional to displacement and pointing back toward the mean position, so acceleration equals minus omega squared times x. The time period of a spring–mass system is two pi root m over k, and for a simple pendulum it is two pi root l over g. Energy keeps swapping between kinetic at the mean position and potential at the extremes.",
    mathHint: '$a=-\\omega^2 x$, $x=A\\sin(\\omega t+\\phi)$, $T_{\\text{spring}}=2\\pi\\sqrt{m/k}$, $T_{\\text{pendulum}}=2\\pi\\sqrt{l/g}$, $E=\\tfrac12 kA^2$',
    tip: 'Shortcut: speed at displacement x is omega times root A squared minus x squared. Amplitude does not change the time period — that is isochronism, and NEET loves asking it.',
    followUp: 'At which point is the kinetic energy maximum and the acceleration zero?',
  },
  {
    id: 'phy.thermo-sign',
    subject: 'Physics',
    topic: 'Thermodynamics — sign convention & processes',
    keywords: ['first law', 'thermodynamics sign', 'delta q', 'delta u', 'adiabatic', 'isothermal', 'isobaric', 'isochoric', 'heat absorbed', 'work done by gas'],
    spoken:
      "Fix the chemistry of signs early: heat given to the system is positive, and work done by the system is positive. Then the first law reads delta Q equals delta U plus delta W. In an isothermal process for an ideal gas, delta U is zero, so all the heat becomes work; in an adiabatic process, Q is zero and the internal energy pays for the work.",
    mathHint: '$\\Delta Q=\\Delta U+\\Delta W$, $\\Delta W=\\int P\\,dV$, isothermal $W=nRT\\ln(V_2/V_1)$, adiabatic $PV^{\\gamma}=\\text{const}$',
    tip: 'Trap: physics takes work done BY the gas as positive, chemistry takes work done ON the system as positive. Read the subject of the paper before you write the first law.',
    followUp: 'In a free expansion into a vacuum, what are Q, W and delta U?',
  },
  {
    id: 'phy.gauss',
    subject: 'Physics',
    topic: 'Electrostatics — Gauss law & potential',
    keywords: ['gauss law', 'gaussian surface', 'electric flux', 'electric field', 'coulomb', 'potential energy', 'equipotential', 'dielectric', 'capacitor'],
    spoken:
      "Gauss's law says the total flux through a closed surface equals the charge enclosed divided by epsilon naught. The enclosed charge decides the flux, but the field at any point is produced by every charge, inside and outside. Potential is a scalar, so you simply add potentials algebraically, which makes it far easier than field.",
    mathHint: '$\\oint \\vec E\\cdot d\\vec A=\\dfrac{q_{\\text{in}}}{\\varepsilon_0}$; $V=\\dfrac{1}{4\\pi\\varepsilon_0}\\dfrac{q}{r}$; $\\vec E=-\\dfrac{dV}{dr}\\hat r$',
    tip: 'Trap: field inside a conductor or a uniformly charged shell is zero, but the potential there is constant and equal to the surface value — not zero.',
    followUp: 'Why is the potential inside a charged shell the same as on its surface?',
  },
  {
    id: 'phy.magnetic-force',
    subject: 'Physics',
    topic: 'Magnetic effects — Lorentz force',
    keywords: ['lorentz force', 'magnetic force', 'qv cross b', 'charged particle in magnetic field', 'cyclotron', 'right hand rule', 'fleming', 'biot savart', 'ampere'],
    spoken:
      "The magnetic force on a moving charge is q v cross B, so it is always perpendicular to the velocity. A perpendicular force can only bend the path, it can never speed the particle up, which is why magnetic force does zero work and the kinetic energy stays constant. The particle then moves in a circle of radius m v over q B.",
    mathHint: '$\\vec F=q(\\vec E+\\vec v\\times\\vec B)$, $r=\\dfrac{mv}{qB}$, $T=\\dfrac{2\\pi m}{qB}$, $W_B=0$',
    tip: 'Shortcut: the time period of circular motion in a magnetic field is independent of speed — that is exactly why a cyclotron works.',
    followUp: 'If the speed doubles, what happens to the radius and to the time period?',
  },
  {
    id: 'phy.ray-optics',
    subject: 'Physics',
    topic: 'Ray optics — mirror & lens sign convention',
    keywords: ['ray optics', 'mirror formula', 'lens formula', 'sign convention mirror', 'concave', 'convex', 'magnification', 'refraction', 'total internal reflection', 'critical angle'],
    spoken:
      "Use the new Cartesian convention: measure every distance from the pole or the optical centre, and take the direction of the incident light as positive. So for a real object the object distance u is negative, and a concave mirror has negative focal length. Magnification is minus v over u for mirrors and v over u for lenses.",
    mathHint: '$\\dfrac1v+\\dfrac1u=\\dfrac1f$ (mirror), $\\dfrac1v-\\dfrac1u=\\dfrac1f$ (lens), $m=-\\dfrac vu$ (mirror), $m=\\dfrac vu$ (lens)',
    tip: 'Trap: plug in the signs with the values, never separately. Most wrong answers here come from putting u as positive out of habit.',
    followUp: 'For a concave mirror with the object between F and P, is the image real or virtual — and what sign does v get?',
  },
  {
    id: 'phy.modern',
    subject: 'Physics',
    topic: 'Modern physics — photoelectric & nuclei',
    keywords: ['photoelectric', 'work function', 'threshold frequency', 'de broglie', 'half life', 'radioactive decay', 'binding energy', 'bohr model', 'hydrogen spectrum'],
    spoken:
      "In the photoelectric effect the maximum kinetic energy of an emitted electron is h nu minus the work function. Intensity controls how many electrons come out, frequency controls how energetic they are, and nothing is emitted below the threshold frequency. For nuclei, binding energy per nucleon peaks near iron, which is why both fusion of light nuclei and fission of heavy nuclei release energy.",
    mathHint: '$K_{\\max}=h\\nu-\\phi_0$, $\\nu_0=\\phi_0/h$, $\\lambda=h/p$, $N=N_0e^{-\\lambda t}$, $t_{1/2}=\\ln2/\\lambda$',
    tip: 'NEET favourite: the slope of the stopping-potential versus frequency graph is h over e for every metal, while the intercept changes with the work function.',
    followUp: 'If you double the intensity but keep the frequency fixed, what changes in the graph?',
  },

  /* --------------------------- CHEMISTRY --------------------------- */
  {
    id: 'chem.mole',
    subject: 'Chemistry',
    topic: 'Mole concept & stoichiometry',
    keywords: ['mole concept', 'mole', 'avogadro', 'molar mass', 'number of moles', 'molarity', 'molality', 'normality', 'stoichiometry', 'empirical formula'],
    spoken:
      "The mole is just a counting unit, six point zero two two times ten to the twenty-three particles. Everything in numerical chemistry converts to moles first: mass over molar mass, volume of gas at STP over twenty-two point four litres, or molarity times volume in litres. Once all quantities are in moles, the balanced equation's coefficients do the rest.",
    mathHint: '$n=\\dfrac{m}{M}=\\dfrac{N}{N_A}=\\dfrac{V_{\\text{gas,STP}}}{22.4\\ \\mathrm L}=MV_{(\\mathrm L)}$',
    tip: 'Trap: molarity changes with temperature because volume expands, molality does not because it uses mass. That is why molality is preferred in colligative properties.',
    followUp: 'Quick check — how many moles are in 9 grams of water?',
  },
  {
    id: 'chem.limiting-reagent',
    subject: 'Chemistry',
    topic: 'Limiting reagent',
    keywords: ['limiting reagent', 'limiting reactant', 'excess reagent', 'which reactant', 'theoretical yield', 'percent yield'],
    spoken:
      "Divide the moles of each reactant by its own coefficient in the balanced equation. The smallest quotient belongs to the limiting reagent, and that is the one that decides your product. Never compare raw mole numbers directly, because the coefficients change the meaning.",
    mathHint: '$\\text{compare } \\dfrac{n_i}{\\nu_i}$; smallest $\\Rightarrow$ limiting reagent',
    tip: 'Shortcut: once you know the limiting reagent, moles of product = its moles times the product-to-reagent coefficient ratio. Percent yield is actual over theoretical times 100.',
    followUp: 'Two moles of nitrogen with three moles of hydrogen making ammonia — which one limits?',
  },
  {
    id: 'chem.equilibrium-qc-kc',
    subject: 'Chemistry',
    topic: 'Chemical equilibrium — Q vs K',
    keywords: ['equilibrium', 'kc', 'kp', 'reaction quotient', 'q greater than k', 'degree of dissociation', 'le chatelier', 'equilibrium constant'],
    spoken:
      "The equilibrium constant is the ratio of product concentrations to reactant concentrations, each raised to its coefficient, evaluated only at equilibrium. Before equilibrium, the same expression gives you Q. If Q is less than K the reaction moves forward, if Q is greater than K it moves backward.",
    mathHint: '$aA+bB\\rightleftharpoons cC+dD:\\;K_c=\\dfrac{[C]^c[D]^d}{[A]^a[B]^b}$, $Q<K$ forward, $Q>K$ backward, $K_p=K_c(RT)^{\\Delta n_g}$',
    tip: 'Trap: pure solids and pure liquids never enter the K expression. And a catalyst speeds up both directions equally, so it changes time, not the position of equilibrium.',
    followUp: 'If you double the volume of a gaseous equilibrium with more moles on the product side, which way does it shift?',
  },
  {
    id: 'chem.ionic-equilibrium',
    subject: 'Chemistry',
    topic: 'Ionic equilibrium — pH, buffers & hydrolysis',
    keywords: ['ph', 'poh', 'ionic product', 'buffer', 'henderson', 'hydrolysis', 'salt of weak acid', 'kw', 'acidic salt', 'basic salt', 'common ion'],
    spoken:
      "pH is minus log of hydrogen ion concentration, and in water at twenty-five degrees, pH plus pOH is always fourteen. For a strong acid you take the concentration directly; for a weak acid you use root Ka times C. A buffer resists pH change because it holds both a weak acid and its conjugate base, and its pH comes from pKa plus log of salt over acid.",
    mathHint: '$\\mathrm{pH}=-\\log[H^+]$, $[H^+][OH^-]=10^{-14}$, weak acid $[H^+]=\\sqrt{K_aC}$, buffer $\\mathrm{pH}=\\mathrm{p}K_a+\\log\\dfrac{[\\text{salt}]}{[\\text{acid}]}$',
    tip: 'Trap: on diluting an acid ten times, pH rises by one only for strong acids. A buffer’s pH barely changes on dilution — that is the entire point of a buffer.',
    followUp: 'Ammonium chloride in water — is the pH above or below seven, and which ion hydrolyses?',
  },
  {
    id: 'chem.acid-base-theory',
    subject: 'Chemistry',
    topic: 'Acid–base theories',
    keywords: ['lewis acid', 'lewis base', 'bronsted', 'arrhenius', 'conjugate acid', 'conjugate base', 'amphoteric', 'proton donor'],
    spoken:
      "Arrhenius talks about H plus and OH minus in water, Bronsted–Lowry is about proton donation and acceptance, and Lewis is the widest: an acid accepts an electron pair, a base donates one. Every conjugate pair differs by exactly one proton.",
    mathHint: '$\\text{acid} \\rightleftharpoons \\text{conjugate base} + H^+$; $K_a\\cdot K_b=K_w$',
    tip: 'NEET trap: BF3 and AlCl3 are Lewis acids with no hydrogen at all. And the conjugate base of a strong acid is always a weak base.',
    followUp: 'What is the conjugate base of HCO3 minus, and can it also act as an acid?',
  },
  {
    id: 'chem.hybridisation',
    subject: 'Chemistry',
    topic: 'Hybridisation & VSEPR shapes',
    keywords: ['hybridisation', 'hybridization', 'sp3', 'sp2', 'vsepr', 'shape of molecule', 'bond angle', 'lone pair', 'geometry', 'steric number'],
    spoken:
      "Count the steric number: bonded atoms plus lone pairs on the central atom. Two gives sp and a linear shape, three gives sp2 and trigonal planar, four gives sp3 and tetrahedral. The geometry name comes from atoms plus lone pairs, but the shape name only counts the atoms.",
    mathHint: '$\\text{SN}=\\dfrac{1}{2}\\left[V+M-C+A\\right]$ where $V$ = valence $e^-$ of central atom, $M$ = monovalent atoms, $C$ = cationic charge, $A$ = anionic charge',
    tip: 'Trap: bond angles shrink in the order lone pair–lone pair greater than lone pair–bond pair greater than bond pair–bond pair. That is why water is 104.5 degrees and ammonia 107, not 109.5.',
    followUp: 'SF4 has steric number five — can you name its shape and say where the lone pair sits?',
  },
  {
    id: 'chem.hydrogen-bond',
    subject: 'Chemistry',
    topic: 'Intermolecular forces & hydrogen bonding',
    keywords: ['hydrogen bonding', 'van der waals', 'dipole dipole', 'boiling point trend', 'anomalous boiling point', 'intermolecular', 'london dispersion', 'why water has high boiling point'],
    spoken:
      "Hydrogen bonding is a strong dipole–dipole attraction that needs hydrogen attached to fluorine, oxygen or nitrogen. It is why water, ammonia and hydrogen fluoride have boiling points far above the rest of their group. Strength of hydrogen bonding also decides ice being less dense than water, because of the open cage structure.",
    mathHint: '$\\mathrm{H\\!-\\!F\\cdots H\\!-\\!F}$; strength $\\propto$ electronegativity and $\\propto 1/r$',
    tip: 'Shortcut: among isomers, the more branched one has smaller surface area, weaker London forces and a lower boiling point. Straight chain always boils higher.',
    followUp: 'Why does o-nitrophenol steam-distil while p-nitrophenol does not?',
  },
  {
    id: 'chem.resonance',
    subject: 'Chemistry',
    topic: 'Resonance & formal charge',
    keywords: ['resonance', 'resonance structure', 'canonical structure', 'formal charge', 'delocalisation', 'mesomeric', 'hyperconjugation', 'electromeric'],
    spoken:
      "Resonance structures are not real molecules flipping between forms; the real species is a hybrid, more stable than any single structure. The most important contributor has the fewest formal charges, negative charge on the more electronegative atom, and complete octets.",
    mathHint: '$\\text{Formal charge}=V-\\dfrac{1}{2}(\\text{shared }e^-)-(\\text{lone }e^-)$; resonance energy $=E_{\\text{hybrid}}-E_{\\text{most stable canonical}}$',
    tip: 'Trap: only electrons move in resonance, never atoms. If the nucleus shifted, it is a different compound, not a resonance structure.',
    followUp: 'In the carbonate ion, how many equivalent structures are there, and what is the bond order of each C–O bond?',
  },
  {
    id: 'chem.thermo-gibbs',
    subject: 'Chemistry',
    topic: 'Chemical thermodynamics — enthalpy, entropy & Gibbs energy',
    keywords: ['gibbs free energy', 'delta g', 'enthalpy', 'entropy', 'spontaneous', 'exothermic', 'endothermic', 'hess law', 'bond enthalpy', 'second law'],
    spoken:
      "Spontaneity is decided by delta G equals delta H minus T delta S. Negative delta G means spontaneous. With the chemistry sign convention, work done on the system is positive, and heat released makes delta H negative. Hess's law works because enthalpy is a state function, so the path does not matter.",
    mathHint: '$\\Delta G=\\Delta H-T\\Delta S$; at equilibrium $\\Delta G=0$ and $\\Delta G^\\circ=-RT\\ln K$; $\\Delta H=\\sum BE_{\\text{reactants}}-\\sum BE_{\\text{products}}$',
    tip: 'Shortcut table: negative H with positive S is spontaneous at all temperatures; positive H with negative S never is; the mixed cases flip at T = delta H over delta S.',
    followUp: 'For an endothermic reaction that is still spontaneous, what must be true about delta S?',
  },
  {
    id: 'chem.kinetics-order',
    subject: 'Chemistry',
    topic: 'Chemical kinetics — order, molecularity & rate constant',
    keywords: ['order of reaction', 'molecularity', 'rate constant', 'first order kinetics', 'zero order', 'half life', 'activation energy', 'arrhenius', 'integrated rate equation'],
    spoken:
      "Order is experimental and can be zero, fractional or negative; molecularity is theoretical, counts the colliding species, and is always a whole number. For a first order reaction the half life is 0.693 over k and does not depend on concentration, while for zero order it is directly proportional to the initial concentration.",
    mathHint: '$k_{1st}=\\dfrac{2.303}{t}\\log\\dfrac{[A]_0}{[A]}$, $t_{1/2}^{1st}=\\dfrac{0.693}{k}$, $t_{1/2}^{0}=\\dfrac{[A]_0}{2k}$, $k=Ae^{-E_a/RT}$',
    tip: 'Units of k give the order instantly: mol per litre per second means zero order, per second means first order, litre per mole per second means second order. JEE Main asks this as a one-mark giveaway.',
    followUp: 'A reaction is 50 percent complete in 20 minutes and 75 percent in 40 minutes — what is the order?',
  },
  {
    id: 'chem.electrochem-nernst',
    subject: 'Chemistry',
    topic: 'Electrochemistry — Nernst equation & cells',
    keywords: ['nernst equation', 'emf', 'cell potential', 'standard electrode potential', 'electrochemical series', 'conductivity', 'faraday', 'galvanic cell', 'salt bridge', 'corrosion'],
    spoken:
      "The Nernst equation corrects the standard cell potential for actual concentrations: E equals E naught minus 0.0591 over n, times log of the reaction quotient, at twenty-five degrees. A positive cell EMF means the reaction is spontaneous, and the salt bridge keeps the two half cells electrically neutral.",
    mathHint: '$E_{\\text{cell}}=E^\\circ_{\\text{cell}}-\\dfrac{0.0591}{n}\\log Q$, $E^\\circ_{\\text{cell}}=E^\\circ_{\\text{cathode}}-E^\\circ_{\\text{anode}}$, $\\Delta G^\\circ=-nFE^\\circ$',
    tip: 'Trap: standard reduction potentials are intensive, so doubling a half reaction does not double E naught. Conductivity falls on dilution but molar conductivity rises.',
    followUp: 'If the concentration of products increases, does the cell EMF go up or down?',
  },
  {
    id: 'chem.goc-carbocation',
    subject: 'Chemistry',
    topic: 'GOC — carbocations, carbanions & stability',
    keywords: ['carbocation', 'carbanion', 'free radical stability', 'inductive effect', 'mesomeric effect', 'electrophile', 'nucleophile', 'aromaticity', 'huckel', 'acidic strength order', 'basic strength order'],
    spoken:
      "Carbocation stability goes tertiary, then secondary, then primary, then methyl, because alkyl groups push electron density in by the inductive effect and hyperconjugation. Resonance beats induction every time: a carbocation next to an oxygen or a benzene ring can be more stable than a tertiary one. Carbanions reverse the order.",
    mathHint: '$3^\\circ>2^\\circ>1^\\circ>CH_3^+$ (also $\\ce{C6H5CH2^+}$, allylic $>$ simple $3^\\circ$); aromatic: $(4n+2)\\ \\pi\\ e^-$, planar, cyclic, conjugated',
    tip: 'Shortcut: to compare acidic strength, compare the stability of the conjugate base. Electron-withdrawing groups increase acidity, electron-donating groups increase basicity.',
    followUp: 'Which is more stable — a benzyl carbocation or a tertiary butyl carbocation? Think resonance first.',
  },
  {
    id: 'chem.markovnikov',
    subject: 'Chemistry',
    topic: 'Addition reactions — Markovnikov & peroxide effect',
    keywords: ['markovnikov', 'anti markovnikov', 'peroxide effect', 'kharasch', 'electrophilic addition', 'hbr addition', 'saytzeff', 'hoffmann', 'addition reaction'],
    spoken:
      "In electrophilic addition to an unsymmetrical alkene, the negative part of the reagent goes to the carbon that already has fewer hydrogens, because that route passes through the more stable carbocation. With HBr in the presence of peroxide the mechanism switches to free radical, and the product is exactly reversed.",
    mathHint: '$\\ce{CH3-CH=CH2 + HBr -> CH3-CHBr-CH3}$ (Markovnikov); with peroxide $\\ce{-> CH3-CH2-CH2Br}$',
    tip: 'Trap: the peroxide effect works only for HBr, not for HCl or HI. HCl’s bond is too strong to break by radical means, HI gives the addition back because the iodine radical step is reversible.',
    followUp: 'Propene plus HBr with peroxide — which carbon does the bromine end up on?',
  },
  {
    id: 'chem.periodic-trends',
    subject: 'Chemistry',
    topic: 'Periodic properties & exceptions',
    keywords: ['ionisation energy', 'ionisation enthalpy', 'electron affinity', 'electronegativity', 'atomic radius', 'periodic trend', 'shielding effect', 'exception in trend'],
    spoken:
      "Across a period, nuclear charge rises and shielding stays about the same, so atomic radius falls and ionisation energy rises. Down a group the reverse happens. The exceptions come from extra stability: half-filled and fully-filled subshells, so nitrogen's ionisation energy is higher than oxygen's, even though oxygen is further right.",
    mathHint: '$IE_1<IE_2<IE_3$ always; stability $p^3$ and $p^6$ configurations; $\\ce{N > O}$ and $\\ce{Be > B}$ in $IE_1$',
    tip: 'NEET trap: electron gain enthalpy of noble gases is positive, and chlorine’s is more negative than fluorine’s because fluorine is so small that the incoming electron faces heavy repulsion.',
    followUp: 'Why is the second ionisation energy of sodium much larger than that of magnesium?',
  },
  {
    id: 'chem.coordination',
    subject: 'Chemistry',
    topic: 'Coordination compounds — isomerism & CFT',
    keywords: ['coordination compound', 'ligand', 'oxidation state', 'crystal field', 'cfse', 'isomerism in coordination', 'werner', 'spectrochemical series', 'magnetic moment', 'denticity'],
    spoken:
      "Find the oxidation state of the central metal from the charges of the ligands and the complex ion. The spectrochemical series orders ligands by the splitting they cause: strong field ligands pair up the d electrons and give low spin, weak field ligands give high spin. Magnetic moment is root n times n plus two, in Bohr magnetons, where n is the number of unpaired electrons.",
    mathHint: '$\\mu=\\sqrt{n(n+2)}\\ \\mathrm{BM}$; $\\Delta_o$ order: $I^-<Br^-<Cl^-<F^-<OH^-<H_2O<NH_3<en<CN^-<CO$',
    tip: 'Trap: ionisation isomers, linkage isomers and hydrate isomers are the three JEE favourites. Only the species outside the square bracket ionises in solution.',
    followUp: 'For an octahedral d6 complex with a strong field ligand, how many unpaired electrons are there?',
  },

  /* --------------------------- MATHEMATICS --------------------------- */
  {
    id: 'math.limits',
    subject: 'Mathematics',
    topic: 'Limits — forms & L\u2019Hospital',
    keywords: ['limit', 'l hospital', "l'hospital", 'left hand limit', 'right hand limit', 'indeterminate form', '0 by 0', 'infinity limit', 'sandwich theorem'],
    spoken:
      "A limit exists only when the left hand limit equals the right hand limit. Before doing any algebra, identify the form: zero by zero and infinity by infinity are the only two that allow L'Hospital's rule. For the standard forms, memorise limit of sin x over x as x tends to zero equals one, and one plus x raised to one over x tends to e.",
    mathHint: '$\\lim_{x\\to0}\\dfrac{\\sin x}{x}=1$, $\\lim_{x\\to0}\\dfrac{\\tan x}{x}=1$, $\\lim_{x\\to0}(1+x)^{1/x}=e$, $\\lim_{x\\to\\infty}\\left(1+\\dfrac1x\\right)^x=e$',
    tip: 'Trap: never apply L\u2019Hospital to a form that is not indeterminate, and never to a piecewise function at the junction point — check the two sides separately there.',
    followUp: 'What is the limit of x squared sin one over x as x tends to zero — and which theorem settles it?',
  },
  {
    id: 'math.continuity-diff',
    subject: 'Mathematics',
    topic: 'Continuity & differentiability',
    keywords: ['continuity', 'continuous', 'differentiability', 'differentiable', 'modulus function', 'corner point', 'kink', 'greatest integer function'],
    spoken:
      "Continuity needs three things at a point: the function is defined there, the limit exists there, and the two are equal. Differentiability is stronger — every differentiable function is continuous, but not the other way round. The modulus function at zero is the classic example: continuous, but with a sharp corner, so not differentiable.",
    mathHint: '$f(a^-)=f(a)=f(a^+)$ for continuity; $f\'(a^-)=f\'(a^+)$ for differentiability; $|x|$ not differentiable at $x=0$',
    tip: 'Trap: the greatest integer function is discontinuous at every integer, so it is automatically non-differentiable there too. In JEE Advanced, check differentiability of the derivative as well for twice-differentiable claims.',
    followUp: 'Is f of x equal to x modulus x continuous and differentiable at zero?',
  },
  {
    id: 'math.chain-rule',
    subject: 'Mathematics',
    topic: 'Differentiation — chain, product & implicit',
    keywords: ['chain rule', 'product rule', 'quotient rule', 'implicit differentiation', 'logarithmic differentiation', 'derivative of', 'parametric differentiation', 'nth derivative'],
    spoken:
      "For a composite function, differentiate the outer layer keeping the inside untouched, then multiply by the derivative of the inside, and repeat inward. Logarithmic differentiation is the clean route when the variable appears in both the base and the exponent, like x raised to the power x.",
    mathHint: '$\\dfrac{dy}{dx}=\\dfrac{dy}{du}\\cdot\\dfrac{du}{dx}$; $(uv)\'=u\'v+uv\'$; $y=x^x\\Rightarrow \\ln y=x\\ln x\\Rightarrow \\dfrac{dy}{dx}=x^x(1+\\ln x)$',
    tip: 'Shortcut: for a product of three functions, expand in three terms each time differentiating one. For parametric forms, never divide dy by dx directly — compute each against the parameter first.',
    followUp: 'Can you differentiate sin of x squared in one step and tell me which part is the inner derivative?',
  },
  {
    id: 'math.integration-methods',
    subject: 'Mathematics',
    topic: 'Integration — substitution, by parts & partial fractions',
    keywords: ['integration', 'integrate', 'substitution', 'by parts', 'partial fractions', 'integral of', 'standard integral', 'trigonometric integral', 'definite integral'],
    spoken:
      "Choose the method by looking at the shape. If you can spot a function and its own derivative, substitute. For a product of two unrelated functions, use by parts with the LIATE priority. For a rational fraction, split it into partial fractions first. And a definite integral always gives a number — the plus c disappears.",
    mathHint: '$\\int u\\,dv=uv-\\int v\\,du$; $\\int \\dfrac{dx}{a^2+x^2}=\\dfrac1a\\tan^{-1}\\!\\dfrac xa+c$; $\\int\\dfrac{dx}{\\sqrt{a^2-x^2}}=\\sin^{-1}\\!\\dfrac xa+c$',
    tip: 'LIATE: Logarithmic, Inverse trigonometric, Algebraic, Trigonometric, Exponential — whichever comes first becomes u. Trap: forgetting plus c in indefinite integrals costs marks every single year.',
    followUp: 'Integral of x times e to the x dx — which one do you take as u?',
  },
  {
    id: 'math.definite-properties',
    subject: 'Mathematics',
    topic: 'Definite integrals — properties & symmetry',
    keywords: ['definite integral property', 'king property', 'even function integral', 'odd function integral', 'integral from 0 to a', 'symmetry in integration', 'periodic integral'],
    spoken:
      "Two properties solve most JEE definite integral questions. The first is the king rule: integral of f of x from zero to a equals integral of f of a minus x over the same limits. The second is symmetry: over minus a to a, an odd function integrates to zero and an even function gives twice the integral from zero to a.",
    mathHint: '$\\int_0^a f(x)\\,dx=\\int_0^a f(a-x)\\,dx$; $\\int_{-a}^{a}f\\,dx=\\begin{cases}2\\int_0^a f\\,dx,&f\\text{ even}\\\\0,&f\\text{ odd}\\end{cases}$',
    tip: 'Shortcut: integral of x over one plus e to the minus x style questions fall instantly to the king rule plus symmetry. Also remember integral of f of x from a to b equals minus integral from b to a.',
    followUp: 'What is the integral of sin cubed x from minus pi by two to pi by two — odd or even?',
  },
  {
    id: 'math.quadratic',
    subject: 'Mathematics',
    topic: 'Quadratic equations — roots & discriminant',
    keywords: ['quadratic', 'discriminant', 'roots of equation', 'sum of roots', 'product of roots', 'nature of roots', 'common root', 'inequality quadratic'],
    spoken:
      "For a quadratic with coefficients a, b, c, the sum of the roots is minus b over a and the product is c over a. The discriminant b squared minus four a c decides the nature: positive gives two real distinct roots, zero gives equal roots, negative gives a complex conjugate pair.",
    mathHint: '$\\alpha+\\beta=-\\dfrac ba$, $\\alpha\\beta=\\dfrac ca$, $D=b^2-4ac$, $\\alpha,\\beta=\\dfrac{-b\\pm\\sqrt D}{2a}$',
    tip: 'Shortcut: if a plus b plus c equals zero, then one root is 1 and the other is c over a. For sign of a quadratic expression, use the sign scheme with the roots, not substitution of test values.',
    followUp: 'Both roots of a quadratic lie between zero and two — which three conditions do you write?',
  },
  {
    id: 'math.ap-gp',
    subject: 'Mathematics',
    topic: 'Sequences & series — AP, GP, AGP',
    keywords: ['arithmetic progression', 'geometric progression', 'ap gp', 'infinite gp', 'sum of series', 'harmonic progression', 'arithmetico geometric', 'nth term'],
    spoken:
      "An arithmetic progression adds a fixed common difference, a geometric progression multiplies by a fixed common ratio. The sum to infinity of a geometric series exists only when the modulus of the common ratio is less than one, and it equals a over one minus r. Beyond that, it diverges and the question has no finite answer.",
    mathHint: '$a_n=a+(n-1)d$, $S_n=\\dfrac n2[2a+(n-1)d]$, $S_\\infty=\\dfrac{a}{1-r}$ for $|r|<1$, $GM=\\sqrt{ab}$',
    tip: 'Shortcut: for an arithmetico-geometric series, multiply by the common ratio, subtract, and you are left with a pure geometric series. Also AM times HM equals GM squared for two numbers.',
    followUp: 'The sum of an infinite GP is 5 and the first term is 2 — what is the common ratio?',
  },
  {
    id: 'math.permutation-combination',
    subject: 'Mathematics',
    topic: 'Permutations, combinations & probability',
    keywords: ['permutation', 'combination', 'arrangement', 'selection', 'probability', 'bayes', 'conditional probability', 'mutually exclusive', 'independent events', 'distribution', 'stars and bars'],
    spoken:
      "Ask one question only: does the order matter? If yes, it is a permutation; if you are just choosing, it is a combination. In probability, mutually exclusive means the events cannot happen together, while independent means one does not change the other's chance — students mix these up constantly.",
    mathHint: '${}^nP_r=\\dfrac{n!}{(n-r)!}$, ${}^nC_r=\\dfrac{n!}{r!(n-r)!}$, $P(A|B)=\\dfrac{P(A\\cap B)}{P(B)}$, distributing $n$ identical objects in $r$ boxes $={}^{n+r-1}C_{r-1}$',
    tip: 'Trap: at least one is far easier as one minus none. And in Bayes questions, always write the total probability in the denominator first, then the favourable branch on top.',
    followUp: 'A die is rolled twice — what is the probability of at least one six, using the complement?',
  },
  {
    id: 'math.vectors-3d',
    subject: 'Mathematics',
    topic: 'Vectors & three-dimensional geometry',
    keywords: ['vector', 'dot product', 'cross product', 'scalar triple product', 'direction cosine', 'line and plane', 'shortest distance between lines', 'projection of vector'],
    spoken:
      "The dot product gives a scalar and is used for angles and projections, while the cross product gives a vector perpendicular to both and is used for areas. The scalar triple product gives the volume of a parallelepiped and is zero exactly when the three vectors are coplanar.",
    mathHint: '$\\vec a\\cdot\\vec b=|a||b|\\cos\\theta$, $|\\vec a\\times\\vec b|=|a||b|\\sin\\theta$, $[\\vec a\\ \\vec b\\ \\vec c]=\\vec a\\cdot(\\vec b\\times\\vec c)$, coplanar $\\Rightarrow[\\vec a\\ \\vec b\\ \\vec c]=0$',
    tip: 'Trap: the cross product is anti-commutative, so a cross b is minus b cross a. For skew lines, the shortest distance is the scalar triple product of the joining vector with the two direction vectors, divided by the modulus of their cross product.',
    followUp: 'If a dot b equals zero and a cross b is also zero, what can you conclude about the two vectors?',
  },
  {
    id: 'math.matrices',
    subject: 'Mathematics',
    topic: 'Matrices & determinants',
    keywords: ['matrix', 'determinant', 'inverse matrix', 'adjoint', 'singular', 'consistency', 'system of equations', 'cramer', 'elementary operation', 'rank'],
    spoken:
      "A determinant of zero means the matrix is singular, so it has no inverse, and the corresponding system of equations has either no solution or infinitely many. Determinant of a product is the product of determinants, but matrix multiplication itself is not commutative.",
    mathHint: '$|AB|=|A||B|$, $A^{-1}=\\dfrac{1}{|A|}\\operatorname{adj}A$, $A\\cdot\\operatorname{adj}A=|A|I$; consistent unique $\\Rightarrow|A|\\ne0$',
    tip: 'Shortcut: for a three by three, expand along the row or column with the most zeros. Trap: the determinant of a skew-symmetric matrix of odd order is always zero.',
    followUp: 'If A is a two by two matrix with determinant 3, what is the determinant of 2A?',
  },
  {
    id: 'math.maxima-minima',
    subject: 'Mathematics',
    topic: 'Application of derivatives — maxima, minima & monotonicity',
    keywords: ['maxima', 'minima', 'maximum value', 'minimum value', 'increasing function', 'decreasing function', 'critical point', 'second derivative test', 'monotonic', 'rate of change'],
    spoken:
      "Set the first derivative to zero to get the critical points, then use the second derivative: negative means local maximum, positive means local minimum. Do not forget the points where the derivative does not exist, and on a closed interval you must also check the endpoints.",
    mathHint: "$f'(c)=0$, $f''(c)<0\\Rightarrow$ local max, $f''(c)>0\\Rightarrow$ local min; increasing $\\Leftrightarrow f'(x)>0$",
    tip: 'Trap: the second derivative test is inconclusive when f double prime is zero — then go back to the sign change of the first derivative around that point. Absolute maximum on a closed interval can sit at an endpoint.',
    followUp: 'Find the maximum of x cubed minus three x on the closed interval minus two to two — where does it occur?',
  },
  {
    id: 'math.area-curves',
    subject: 'Mathematics',
    topic: 'Area under & between curves',
    keywords: ['area under curve', 'area between curves', 'area bounded by', 'area of region', 'integration for area'],
    spoken:
      "Area is a positive quantity, so integrate the modulus of the function. Between two curves, integrate upper minus lower with respect to x, or right minus left with respect to y if that is simpler. Always find the intersection points first — they are your limits.",
    mathHint: '$A=\\int_a^b |f(x)|\\,dx$, $A=\\int_a^b [f(x)-g(x)]\\,dx$ where $f\\ge g$ on $[a,b]$',
    tip: 'Shortcut: the area between a parabola and a straight line cutting it is one sixth of the base cubed times the leading coefficient, a JEE Advanced favourite. Sketch the region first — a wrong picture gives the wrong limits.',
    followUp: 'For y squared equals 4x and y equals 2x, which curve is upper between the intersection points?',
  },
  {
    id: 'math.complex-numbers',
    subject: 'Mathematics',
    topic: 'Complex numbers',
    keywords: ['complex number', 'modulus argument', 'cube root of unity', 'omega', 'argand plane', 'de moivre', 'imaginary', 'izuchi'],
    spoken:
      "Write every complex number in polar form when powers or roots are involved: modulus times e to the i theta. The cube roots of unity add to zero and their product is one, which is a shortcut in dozens of problems. Geometrically, multiplying by i rotates the point by ninety degrees anticlockwise on the Argand plane.",
    mathHint: '$z=r(\\cos\\theta+i\\sin\\theta)=re^{i\\theta}$, $1+\\omega+\\omega^2=0$, $\\omega^3=1$, $|z_1z_2|=|z_1||z_2|$, $\\arg(z_1z_2)=\\arg z_1+\\arg z_2$',
    tip: 'Trap: argument is multi-valued — the principal value lies between minus pi and pi. Also |z1 + z2| is not |z1| + |z2| in general; equality holds only when the arguments match.',
    followUp: 'What is the value of one plus omega plus omega squared raised to the power 100?',
  },
  {
    id: 'math.coordinate-geometry',
    subject: 'Mathematics',
    topic: 'Straight lines & circles',
    keywords: ['straight line', 'slope', 'equation of line', 'distance from point to line', 'circle equation', 'tangent to circle', 'family of lines', 'perpendicular distance', 'conic', 'parabola', 'ellipse', 'hyperbola'],
    spoken:
      "The perpendicular distance from a point to a line is the modulus of a x one plus b y one plus c, all over root a squared plus b squared. For a circle, the standard form gives the centre and radius directly. Conics in JEE are mostly about using the standard tangent and chord forms rather than re-deriving them.",
    mathHint: '$d=\\dfrac{|ax_1+by_1+c|}{\\sqrt{a^2+b^2}}$, $(x-h)^2+(y-k)^2=r^2$, tangent to $x^2+y^2=r^2$ is $y=mx\\pm r\\sqrt{1+m^2}$',
    tip: 'Trap: the slope form fails for a vertical line, so use the general form ax plus by plus c equals zero whenever a vertical line is possible. For a parabola y squared equals 4ax, the tangent with slope m is y equals mx plus a over m.',
    followUp: 'The distance of the origin from the line 3x plus 4y equals 10 — can you get it in one line?',
  },

  /* --------------------------- STUDY / EXAM STRATEGY --------------------------- */
  {
    id: 'meta.strategy',
    subject: 'Strategy',
    topic: 'Exam strategy, accuracy & revision',
    keywords: ['negative marking', 'how to attempt', 'time management', 'paper strategy', 'revision plan', 'accuracy', 'silly mistake', 'mock test', 'how many questions', 'attempt order', 'board exam'],
    spoken:
      "In a timed paper, the first five minutes are for scanning, not solving: mark the questions you can do in under two minutes and start there. Accuracy beats attempts — with negative marking, leaving a question you are unsure of is a scoring decision, not a failure. Keep an error notebook and revise from it, not from the whole book.",
    mathHint: 'Net score $=4\\times C-1\\times W$ (JEE Main style) $\\Rightarrow$ attempt only when you can eliminate two options',
    tip: 'Rule of thumb: attempt when your probability of being right is above one third, otherwise skip. And always do the chemistry section first in JEE Main — it is the fastest scorer.',
    followUp: 'In your last mock, how many marks did you lose to questions you actually knew?',
  },
  {
    id: 'meta.motivation',
    subject: 'Strategy',
    topic: 'Mindset, burnout & consistency',
    keywords: ['demotivated', 'giving up', 'stress', 'anxiety', 'burnout', 'cant focus', 'cannot focus', 'not studying', 'backlog', 'feel like failing', 'distracted', 'procrastination'],
    spoken:
      "That feeling is data, not a verdict. Backlogs clear with a fixed daily non-negotiable block, not with an all-night plan you will abandon by Thursday. Pick the smallest unit you can finish today — one chapter's formulas plus fifteen questions — and let the momentum do the rest.",
    mathHint: 'Consistency $>$ intensity: $1\\%$ daily improvement $\\Rightarrow (1.01)^{365}\\approx 37.8\\times$',
    tip: 'Practical rule: two pomodoros of twenty-five minutes with the phone in another room beats five hours of half-attention. Log what you finished, not what you planned.',
    followUp: 'What is the one chapter you would clear today if I only gave you ninety minutes?',
  },
];

/* ------------------------------------------------------------------ *
 * Pinpoint remediation — "I didn't get step 2"
 * ------------------------------------------------------------------ */

const REMEDIATION = {
  'phy.sign-convention': {
    spoken:
      "Let us isolate that step. The only decision is which direction is positive. Once up is positive, every downward quantity carries a minus sign, and gravity is downward, so g enters the equation as minus 9.8 — it is not a separate rule, it is the same choice showing up in the formula.",
    mathHint: 'Choose $+\\hat j$ up $\\Rightarrow \\vec a=-g\\hat j$, and $v=u-gt$, $s=ut-\\tfrac12 gt^2$',
    tip: 'Write the convention line at the top of the page before substituting numbers. It prevents almost every sign error.',
    followUp: 'Now flip it: if you choose downward as positive, what sign does the initial upward velocity get?',
  },
  'phy.fbd-normal': {
    spoken:
      "That step is just bookkeeping. Take the body out of the picture, then list every object touching it or acting at a distance — the surface gives a normal and maybe friction, the string gives tension, and the earth gives weight. Those arrows are the complete free body diagram, and the equation is their vector sum equals m a.",
    mathHint: '$\\sum F_x=ma_x$, $\\sum F_y=ma_y$ — resolve along and perpendicular to the plane, not horizontally',
    tip: 'Rule: one diagram per body. If two blocks are involved, you need two diagrams plus the string constraint relating their accelerations.',
    followUp: 'For a block on an incline, which axis do you choose so that the normal force has only one component?',
  },
  'phy.friction': {
    spoken:
      "Here is the hinge of that step: friction is not a fixed number, it is a responsive one. Until sliding begins it matches the applied force exactly, up to a ceiling of mu s times N. So the first thing to test is whether the applied force exceeds that ceiling — if not, the body simply stays put and friction equals the applied force.",
    mathHint: '$F_{\\text{applied}}\\le\\mu_s N \\Rightarrow f=F_{\\text{applied}}$ (static, self-adjusting); else $f=\\mu_k N$',
    tip: 'Never write f equals mu N as your opening move. Ask first: is it moving, or is it just about to move?',
    followUp: 'A 10 kg block on a floor with mu equals 0.4, pushed with 20 N — what is the actual friction force?',
  },
  'phy.centripetal': {
    spoken:
      "The step that trips people is treating centripetal force as an extra arrow. It is not added — it is the name of the net inward force you already have. So write the free body diagram first, then collect the radial components, and set that sum equal to m v squared over r.",
    mathHint: '$\\sum F_{\\text{radial}}=\\dfrac{mv^2}{r}$ — tension, friction, gravity or N supply it',
    tip: 'Check your diagram: if you see a "centripetal force" arrow plus the real forces, you have double counted.',
    followUp: 'For a car turning on a flat road, which force supplies the m v squared over r?',
  },
  'phy.work-energy': {
    spoken:
      "The tricky part is usually which forces are allowed into the equation. The work–energy theorem uses the net work of all forces, including friction. But when you write conservation of mechanical energy, you are promising that no non-conservative force did work — so friction must be absent or handled separately.",
    mathHint: '$W_{\\text{net}}=\\Delta K$ always; $K_i+U_i=K_f+U_f$ only if $W_{nc}=0$',
    tip: 'If friction is present, use W net = delta K, or write K plus U initial minus work done against friction equals K plus U final.',
    followUp: 'A block slides down a rough incline — which equation will you pick and why?',
  },
  'chem.mole': {
    spoken:
      "That conversion step is one division. Take the given mass and divide it by the molar mass of the compound, and you are in moles. From moles, the balanced equation's coefficients become a direct ratio to any other species in the reaction.",
    mathHint: '$n=\\dfrac{\\text{given mass}}{\\text{molar mass}}$, then $\\dfrac{n_{\\text{product}}}{n_{\\text{reactant}}}=\\dfrac{\\nu_{\\text{product}}}{\\nu_{\\text{reactant}}}$',
    tip: 'Work entirely in moles until the final line, then convert back to grams or litres. Converting mid-way is where rounding errors creep in.',
    followUp: 'Fifty-four grams of aluminium reacting with excess oxygen — how many moles of alumina do you get?',
  },
  'chem.equilibrium-qc-kc': {
    spoken:
      "Let us redo that step cleanly. Write the balanced equation, then build the expression with products on top, each raised to its coefficient, and solids left out completely. Now compare the value you computed with K: smaller means the forward reaction still has room to run.",
    mathHint: '$Q_c=\\dfrac{[C]^c[D]^d}{[A]^a[B]^b}$ at any instant; $Q<K$ forward, $Q=K$ equilibrium, $Q>K$ backward',
    tip: 'If the question gives you initial concentrations only, build an ICE table: Initial, Change with the stoichiometric ratios, then Equilibrium.',
    followUp: 'Should we set up the ICE table for a dissociation problem together, row by row?',
  },
  'chem.ionic-equilibrium': {
    spoken:
      "The step you are stuck on is choosing the right formula for hydrogen ion concentration. For a strong acid it is just the concentration times the number of ionisable protons. For a weak acid, only a small fraction dissociates, so you use root Ka times C instead.",
    mathHint: 'Strong: $[H^+]=nC$; weak: $[H^+]=\\sqrt{K_aC}$; salt of weak acid and strong base: $[H^+]=\\sqrt{\\dfrac{K_wK_a}{C}}$',
    tip: 'Identify the species first — strong, weak, or a salt — then the formula picks itself. Mixing these three is the most common error in this chapter.',
    followUp: 'Zero point one molar acetic acid with Ka of one point eight times ten to the minus five — what is the pH?',
  },
  'chem.hybridisation': {
    spoken:
      "The step is counting, not memorising. Count the atoms bonded to the central atom and add the lone pairs on it — that total is the steric number, and it fixes the hybridisation directly: two is sp, three is sp2, four is sp3, five is sp3d, six is sp3d2.",
    mathHint: '$\\text{SN}=\\sigma\\text{ bonds}+\\text{lone pairs}$; $\\text{SN}=4\\Rightarrow sp^3$',
    tip: 'Double and triple bonds count as one sigma bond each for this count — the extra pi bonds do not change the hybridisation.',
    followUp: 'In sulphur tetrafluoride, what is the steric number and where does the lone pair go?',
  },
  'chem.thermo-gibbs': {
    spoken:
      "This step is just a sign audit. Enthalpy change is negative for heat released, entropy change is positive when disorder grows, and then delta G combines them at the given temperature. Plug the numbers with their signs attached and let the arithmetic decide spontaneity.",
    mathHint: '$\\Delta G=\\Delta H-T\\Delta S$; spontaneous if $\\Delta G<0$; $T_{\\text{flip}}=\\dfrac{\\Delta H}{\\Delta S}$',
    tip: 'Keep units consistent — delta H is usually in kilojoules while delta S is in joules per kelvin. That mismatch alone kills a lot of answers.',
    followUp: 'Delta H is positive forty and delta S is positive one hundred joules per kelvin — above what temperature is it spontaneous?',
  },
  'chem.kinetics-order': {
    spoken:
      "The hurdle is telling order from the data. Look at how the rate responds when you change one concentration while holding others fixed: no change means zero order in it, doubling the rate means first order, quadrupling means second order. Add those individual orders for the overall order.",
    mathHint: '$r=k[A]^x[B]^y\\Rightarrow \\dfrac{r_2}{r_1}=\\left(\\dfrac{[A]_2}{[A]_1}\\right)^x$ with $[B]$ fixed',
    tip: 'Units of k reveal the overall order instantly — check them before doing any algebra, it is a five-second confirmation.',
    followUp: 'Rate quadruples when the concentration of A doubles — what is the order in A?',
  },
  'math.limits': {
    spoken:
      "Let us slow that step down. Before any rule, substitute the point and read the form. If you get zero by zero, you have an indeterminate form and you may rationalise, factorise, expand the series, or use L'Hospital. If you get a finite number over zero, the limit does not exist — that is not indeterminate, it is a vertical asymptote.",
    mathHint: '$\\dfrac00,\\ \\dfrac\\infty\\infty,\\ 0\\cdot\\infty,\\ \\infty-\\infty,\\ 1^\\infty,\\ 0^0,\\ \\infty^0$ are the seven indeterminate forms',
    tip: 'For one to the infinity forms, use the exponential shortcut: the limit is e raised to the limit of the exponent times base minus one.',
    followUp: 'What form do you get when you substitute x equals zero into sin x over x, and which tool fits it best?',
  },
  'math.integration-methods': {
    spoken:
      "The step that confuses most students is choosing u. Scan the integrand for a function whose derivative also appears — that inner function is your substitution. If nothing pairs up and you have a product, go to by parts and let LIATE pick u for you.",
    mathHint: '$\\int f(g(x))g\'(x)\\,dx=\\int f(u)\\,du$, $u=g(x)$; by parts $\\int u\\,dv=uv-\\int v\\,du$',
    tip: 'After substituting, you must change the limits too in a definite integral — forgetting that is the single biggest source of wrong answers here.',
    followUp: 'Integral of two x cosine of x squared dx — what substitution do you see?',
  },
  'math.definite-properties': {
    spoken:
      "This step is a substitution in disguise. In the king property you replace x by a minus x, which flips the function but keeps the limits the same after you adjust the differential sign. Then add the original and the transformed integral — the awkward part usually cancels.",
    mathHint: '$I=\\int_0^a f(x)dx=\\int_0^a f(a-x)dx \\Rightarrow 2I=\\int_0^a [f(x)+f(a-x)]dx$',
    tip: 'Classic use: integral of x f of sin x from zero to pi becomes pi over two times integral of f of sin x, because x plus pi minus x equals pi.',
    followUp: 'Want me to run the king property on integral of x sin x over one plus cosine squared x from zero to pi?',
  },
  'math.quadratic': {
    spoken:
      "The step is translating the word condition into algebra. Both roots between two numbers means three things together: the discriminant is non-negative, the function at both endpoints has the same sign as a, and the vertex x coordinate lies inside the interval.",
    mathHint: '$D\\ge0$, $af(p)>0$, $af(q)>0$, $p<-\\dfrac{b}{2a}<q$ for both roots in $(p,q)$',
    tip: 'Draw the parabola sketch next to the conditions — a picture makes all four conditions obvious and stops you missing one.',
    followUp: 'Both roots greater than one — which three conditions do you write down?',
  },
  'math.permutation-combination': {
    spoken:
      "The mental block is usually the word arrangement versus selection. If swapping two chosen items makes a different answer, order matters and you multiply by a factorial. If it does not, you are simply choosing, and you divide by that factorial.",
    mathHint: '${}^nP_r={}^nC_r\\times r!$; at least one $=1-P(\\text{none})$',
    tip: 'Trap: identical objects change everything — distribution of n identical items into r distinct boxes uses n plus r minus one choose r minus one, not n choose r.',
    followUp: 'Choosing three students from ten for a team versus for captain, secretary and treasurer — which is which?',
  },
  'math.maxima-minima': {
    spoken:
      "That step is the second derivative test, and it is only a test of curvature. Negative second derivative means the curve is concave down there, so the critical point is a peak. If the second derivative comes out zero, the test tells you nothing and you must check whether the first derivative changes sign around the point.",
    mathHint: "$f'(c)=0,\\ f''(c)<0\\Rightarrow$ max; $f''(c)=0\\Rightarrow$ test the sign of $f'$ on both sides of $c$",
    tip: 'For word problems, express everything in one variable first, then differentiate. And on a closed interval always compare with the endpoints.',
    followUp: 'If f double prime at the critical point is zero, what do you do next?',
  },
  'math.matrices': {
    spoken:
      "The step is the consistency test. Compute the determinant first. If it is non-zero you get a unique solution. If it is zero, then check the adjoint times B: if that is also the zero matrix you have infinitely many solutions, otherwise the system is inconsistent.",
    mathHint: '$|A|\\ne0\\Rightarrow$ unique; $|A|=0$ and $(\\operatorname{adj}A)B=0\\Rightarrow$ infinitely many; $|A|=0$, $(\\operatorname{adj}A)B\\ne0\\Rightarrow$ no solution',
    tip: 'Shortcut in MCQs: for a homogeneous system AX = 0, a non-zero determinant means only the trivial solution exists.',
    followUp: 'A system with determinant zero and adjoint times B non-zero — how many solutions does it have?',
  },
};

/* ------------------------------------------------------------------ *
 * Generic handlers
 * ------------------------------------------------------------------ */

const CONFUSION = /(?:i (?:did|didn'?t|do not|dont) (?:get|understand)|not (?:getting|clear)|confus|didn'?t get|step \d|explain (?:it |this |that )?(?:again|once more)|samajh(?:h|) (?:nahi|nhi|na)|dobara|phir se|repeat|why\??$|kaise|how come|i am lost|stuck)/i;

const STEP_RE = /step\s*(\d+)|(\d+)(?:st|nd|rd|th)\s+step|point\s*(\d+)/i;

const GREET = /^(hi|hello|hey|namaste|namaskar|good (morning|evening|afternoon)|astra)\b/i;

const THANKS = /(thank|thanks|shukriya|dhanyavad|great|nice|awesome|perfect|got it|clear ho gaya|samajh (?:a|aa) (?:gaya|gayi))/i;

const EXAM_INFO = /(jee\s*(main|advanced)?|neet|bitsat|which exam|target exam)/i;

const NUMERICAL = /(solve|numerical|question|problem|previous year|pyq|answer of|calculate|find the value)/i;

function clean(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\w\s+\-*/^=().,?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function score(rule, text) {
  let score = 0;
  const hits = [];
  for (const kw of rule.keywords) {
    const needle = clean(kw);
    if (!needle) continue;
    const idx = text.indexOf(needle);
    if (idx >= 0) {
      // longer phrases are stronger evidence
      score += needle.includes(' ') ? 3 : 2;
      hits.push(kw);
    }
  }
  // single-word topic names earn a small bonus when the word is distinctive
  return { score, hits };
}

function topicLabel(history = []) {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const t = history[i]?.contextTopic || history[i]?.topic;
    if (t) return t;
  }
  return null;
}

function lastRuleId(history = []) {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i] && history[i].ruleId) return history[i].ruleId;
  }
  return null;
}

function voiceChat(spoken, mathHint, tip, followUp, extra = {}) {
  return {
    mode: 'VOICE_CHAT',
    spokenResponse: String(spoken).replace(/\s+/g, ' ').trim(),
    uiDisplay: {
      mathHint: String(mathHint || '').trim(),
      actionableTip: String(tip || '').trim(),
    },
    followUpPrompt: String(followUp || '').trim(),
    ...extra,
  };
}

function packRule(rule, extra = {}) {
  const json = voiceChat(rule.spoken, rule.mathHint, rule.tip, rule.followUp, {
    intent: 'concept',
    subject: rule.subject,
    topic: rule.topic,
    matchedKeywords: extra.matchedKeywords || [],
    engine: 'offline-knowledge-base',
    ...extra.json,
  });
  return { json, ruleId: rule.id, topic: rule.topic, subject: rule.subject };
}

function remediate(ruleId, stepNumber, topic) {
  const rem = REMEDIATION[ruleId];
  const step = stepNumber ? `Step ${stepNumber}` : 'That step';
  if (rem) {
    return {
      json: voiceChat(rem.spoken, rem.mathHint, rem.tip, rem.followUp, {
        intent: 'remediation',
        pinpoint: step,
        topic,
        engine: 'offline-knowledge-base',
      }),
      ruleId,
      topic,
      subject: 'Remediation',
    };
  }
  return {
    json: voiceChat(
      `Let us take ${step.toLowerCase()} apart instead of repeating the whole thing. Tell me the exact line you are reading — the equation or the sentence — and I will break that single transition into smaller moves, because the gap is almost always one substitution or one sign flip.`,
      stepNumber ? `Pinpointing slide ${stepNumber}: write the line you are stuck on` : 'Pinpoint the exact line you are stuck on',
      'Exam trap: most "I don\u2019t get step 2" moments are actually a missing assumption from step 1 — re-check what was assumed, not what was calculated.',
      'Read me the line you are stuck on, and I will show the move between it and the next line?',
      { intent: 'remediation', pinpoint: step, topic, engine: 'offline-knowledge-base' }
    ),
    ruleId,
    topic,
    subject: 'Remediation',
  };
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

function answer({ message = '', history = [], subject = null, contextTopic = null } = {}) {
  const text = clean(message);
  const stepMatch = message.match(STEP_RE);
  const stepNumber = stepMatch ? Number(stepMatch[1] || stepMatch[2] || stepMatch[3]) : null;
  const isConfused = CONFUSION.test(message);

  // 1. Pinpointed confusion -> remediation, not a re-lecture.
  if (isConfused) {
    const ruleId = contextTopic ? matchRuleIdByTopic(contextTopic) : null;
    const fallbackId = ruleId || lastRuleId(history);
    const topic = contextTopic || topicLabel(history) || RULES.find((r) => r.id === fallbackId)?.topic;
    if (stepNumber || fallbackId || topic) return remediate(fallbackId, stepNumber, topic || null);
  }

  // 2. Greeting / small talk.
  if (GREET.test(text) && text.split(' ').length <= 5) {
    return {
      json: voiceChat(
        "Hey, Astra here. Tell me the chapter and which exam you are targeting, or just speak your doubt the way you would ask a friend — I will keep the answer short and put the exact equation on screen for you.",
        'Ready: Physics, Chemistry, Mathematics — JEE Main, JEE Advanced or NEET',
        'Shortcut: say the chapter name plus the word "lecture" and I will build the full slide deck with narration.',
        'Which chapter are we attacking first — or is there a question that has been stuck since yesterday?',
        { intent: 'greeting', engine: 'offline-knowledge-base' }
      ),
      ruleId: 'meta.greeting',
      topic: 'Session start',
      subject: 'Strategy',
    };
  }

  if (THANKS.test(text) && text.split(' ').length <= 6) {
    return {
      json: voiceChat(
        "Good, that one is locked in now. Say the next doubt out loud, or if you want, I can give you a two-minute recall drill on this same chapter so it sticks for the exam.",
        '',
        'Revision rule: re-attempt this concept after twenty-four hours and again after seven days — two touches beat ten readings.',
        'Want a quick recall question on this, or should we move to the next topic?',
        { intent: 'acknowledgement', engine: 'offline-knowledge-base' }
      ),
      ruleId: 'meta.thanks',
      topic: 'Session',
      subject: 'Strategy',
    };
  }

  // 3. Scored retrieval over the knowledge base.
  const ranked = RULES.map((rule) => {
    const s = score(rule, text);
    let total = s.score;
    if (subject && rule.subject === subject) total += 1;
    if (contextTopic && rule.topic && contextTopic.toLowerCase().includes(rule.topic.toLowerCase().slice(0, 12))) total += 2;
    return { rule, total, hits: s.hits };
  })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);

  if (ranked.length && ranked[0].total >= 2) {
    const best = ranked[0];
    return packRule(best.rule, { matchedKeywords: best.hits.slice(0, 4) });
  }

  // 4. Explicit request for a lesson -> hand back to LECTURE_MODE.
  if (/(teach|lecture|chapter|explain the topic|full topic|start from basics|revise)/i.test(message)) {
    return {
      json: voiceChat(
        "That sounds like a full lesson rather than a single doubt. Say the chapter name and your target exam and I will build the lecture deck with narration slide by slide — meanwhile, tell me the one thing about this topic that feels foggiest and we will start the deck there.",
        'Lecture request: pick a chapter from the library to get the LECTURE_MODE deck',
        'Trap: starting a chapter without knowing your weak sub-topic wastes time — name the sub-topic that scares you first.',
        'Which exam are you targeting for this chapter — JEE Main, JEE Advanced or NEET?',
        { intent: 'lecture-request', engine: 'offline-knowledge-base' }
      ),
      ruleId: 'meta.lecture-request',
      topic: 'Lecture handoff',
      subject: 'Strategy',
    };
  }

  if (NUMERICAL.test(message)) {
    return {
      json: voiceChat(
        "Let us solve it the exam way. First tell me the given data and what is asked, then we write the one governing equation before touching any numbers — that order alone removes most mistakes. Read the question out loud to me and I will take it step by step with you.",
        'Method: given $\\to$ governing equation $\\to$ substitution $\\to$ units check',
        'Trap: never substitute numbers before the symbolic equation is written. In JEE Advanced the same equation with different data is a different answer.',
        'What are the given values, and is the answer expected in symbols or numbers?',
        { intent: 'numerical', engine: 'offline-knowledge-base' }
      ),
      ruleId: 'meta.numerical',
      topic: 'Problem solving',
      subject: subject || 'General',
    };
  }

  if (EXAM_INFO.test(message)) {
    return {
      json: voiceChat(
        "Good instinct to tie it to the exam. JEE Main tests speed and formula recall, JEE Advanced tests multi-concept depth and manipulation, and NEET tests NCERT precision and factual accuracy. Tell me your target and I will tune the depth of every answer from here on.",
        'JEE Main: 25 questions, 75 marks, 4 / −1. JEE Advanced: subjective, multi-correct. NEET: 180 questions, 720 marks, 4 / −1',
        'Strategy: NEET answers must match NCERT wording exactly — do not use a richer definition than the book gives.',
        'Which one are you writing — JEE Main, JEE Advanced or NEET?',
        { intent: 'exam-info', engine: 'offline-knowledge-base' }
      ),
      ruleId: 'meta.exam-info',
      topic: 'Exam pattern',
      subject: 'Strategy',
    };
  }

  // 5. Honest fallback — still useful, never bluffing.
  return {
    json: voiceChat(
      "I want to give you a precise answer here, not a vague one, so let me narrow it down. Tell me the chapter this belongs to and the exact line you are questioning, and I will explain that single step with the formula on screen beside it.",
      'Ask with the chapter name, for example: "in rotational motion, why is torque r cross F"',
      'Exam trap: a doubt asked without its chapter usually hides a missing prerequisite — name the chapter and I will check the prerequisite first.',
      'Which chapter is this from — Physics, Chemistry or Maths?',
      { intent: 'clarify', engine: 'offline-knowledge-base' }
    ),
    ruleId: 'meta.clarify',
    topic: null,
    subject: subject || 'General',
  };
}

function matchRuleIdByTopic(topic) {
  if (!topic) return null;
  const t = clean(topic);
  const found = RULES.find((r) => clean(r.topic) === t);
  if (found) return found.id;
  const partial = RULES.find((r) => t.includes(clean(r.topic).split(' ')[0]) && clean(r.topic).split(' ').some((w) => t.includes(w)));
  return partial ? partial.id : null;
}

function stats() {
  return {
    rules: RULES.length,
    remediation: Object.keys(REMEDIATION).length,
    subjects: [...new Set(RULES.map((r) => r.subject))],
  };
}

function topics() {
  return RULES.map((r) => ({ id: r.id, subject: r.subject, topic: r.topic }));
}

module.exports = { answer, stats, topics, RULES, REMEDIATION, SCHEMA };
