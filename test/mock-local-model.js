'use strict';

/**
 * mock-local-model.js — a fake Ollama/LM Studio-class server used by the tests.
 *
 * It behaves like a real 3B local model does: it wraps JSON in a markdown
 * fence, drops a key, leaks LaTeX into the voiceScript and returns a
 * non-standard key — so the validate/repair path in server/schema.js gets
 * genuinely exercised instead of being handed perfect output.
 */

const http = require('node:http');

function messyLecture(topic, exam) {
  return {
    // no "mode" key, "formulas" instead of "latexFormulas", LaTeX inside voiceScript
    topic,
    targetExam: exam,
    subject: 'Physics',
    tagline: 'Generated locally.',
    slides: [
      {
        title: 'Definition and why it matters',
        content: {
          bullets: [
            'Moment of inertia is the rotational analogue of mass.',
            'It depends on the mass distribution about the axis, not just the total mass.',
            'It is a scalar for a fixed axis and a tensor in the general case.',
            'Radius of gyration collects the distribution into a single distance.',
          ],
          formulas: ['I=\\sum m_ir_i^2', 'I=\\frac{1}{2}MR^2\\ (\\text{disc})', '\\tau=I\\alpha'],
          keyTakeaway: 'Same mass, different distribution, different I.',
        },
        voiceScript:
          'We start with the definition. The moment of inertia is $I=\\sum m_ir_i^2$, which is the rotational analogue of mass. Notice that it depends on where the mass sits relative to the axis.',
      },
      {
        title: 'Torque and angular momentum',
        content: {
          bullets: [
            'Torque is the rotational analogue of force and equals I alpha.',
            'Angular momentum L equals I omega and is conserved when external torque is zero.',
            'A spinning skater pulls the arms in, I falls, so omega rises.',
          ],
          latexFormulas: ['\\tau=I\\alpha=\\frac{dL}{dt}', 'L=I\\omega'],
          keyTakeaway: 'No external torque means angular momentum is conserved.',
        },
        voiceScript:
          'Next, torque and angular momentum. Torque equals I alpha, and it is also the time rate of change of angular momentum. When the external torque is zero, angular momentum is conserved, which is why a skater spins faster with the arms pulled in.',
      },
      {
        title: 'Theorems and standard results',
        content: {
          bullets: [
            'Parallel axis theorem shifts an axis by a distance d.',
            'Perpendicular axis theorem applies to laminar bodies only.',
            'Standard results for rod, disc, ring and sphere must be memorised with their axes.',
          ],
          latexFormulas: ['I=I_{cm}+Md^2', 'I_z=I_x+I_y'],
          keyTakeaway: 'Perpendicular axis theorem is only for plane laminas.',
        },
        voiceScript:
          'Finally the two theorems. The parallel axis theorem says the moment of inertia about any axis equals the value about the parallel centre of mass axis plus M d squared. The perpendicular axis theorem applies only to plane laminas.',
      },
      {
        title: 'Traps and a practice plan',
        content: {
          bullets: [
            'Trap: using the perpendicular axis theorem on a three-dimensional body.',
            'Trap: forgetting that radius of gyration depends on the axis.',
            'Trap: mixing up torque about the centre of mass with torque about a hinge.',
          ],
          latexFormulas: ['K=\\sqrt{I/M}'],
          keyTakeaway: 'Name the axis before you name the formula.',
        },
        voiceScript:
          'Let us close with traps. Never apply the perpendicular axis theorem to a three dimensional body, always name the axis before choosing a formula, and be careful with torque about a hinge versus about the centre of mass.',
      },
    ],
  };
}

function messyPractice(topic) {
  return [
    {
      question: `A disc of mass 2 kg and radius 0.5 m rotates about its central axis. Its moment of inertia is (topic: ${topic})`,
      options: ['0.25 kg m^2', '0.5 kg m^2', '1.0 kg m^2', '0.125 kg m^2'],
      // deliberately a letter, not an index — the validator must normalise it
      correct: 'A',
      explanation: 'For a disc about its central axis I = MR^2/2 = 2 x 0.25 / 2 = 0.25 kg m^2.',
      difficulty: 'EASY',
    },
    {
      question: 'A skater pulls her arms in while spinning. Which quantity stays constant?',
      options: ['Angular velocity', 'Moment of inertia', 'Angular momentum', 'Rotational kinetic energy'],
      correct: 2,
      explanation: 'With no external torque, L = I omega is conserved; I falls so omega rises and kinetic energy increases.',
      difficulty: 'medium',
    },
  ];
}

function start({ port = 0, mode = 'ollama' } = {}) {
  const calls = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const url = req.url;
      calls.push({ url, method: req.method, body: raw ? JSON.parse(raw) : null });
      const body = raw ? JSON.parse(raw) : {};
      const prompt = mode === 'ollama' ? body.messages?.[body.messages.length - 1]?.content || '' : body.messages?.[body.messages.length - 1]?.content || '';
      const wantsPractice = /practice questions/i.test(prompt);
      const wantsVoiceChat = /VOICE_CHAT_MODE JSON only/.test(prompt);
      const repaired = /REJECTED|corrected JSON/i.test(prompt);

      let payloadText;
      if (wantsVoiceChat) {
        // A small model that half-follows instructions: right shape, but it
        // leaks LaTeX into spokenResponse and forgets the follow-up.
        payloadText = JSON.stringify({
          mode: 'VOICE_CHAT',
          spokenResponse: 'Because $L=I\\omega$ is conserved, when she pulls her arms in $I$ falls so $\\omega$ rises.',
          uiDisplay: { mathHint: '$L=I\\omega=\\text{const}$', actionableTip: 'Trap: kinetic energy is NOT conserved here, it increases.' },
        });
      } else if (wantsPractice) {
        payloadText = JSON.stringify({ questions: messyPractice('rotational motion') });
      } else if (repaired) {
        // On the repair round-trip behave like a well-instructed model.
        const fixed = messyLecture('Rotational motion', 'JEE Advanced');
        fixed.mode = 'LECTURE';
        fixed.slides.forEach((s, i) => {
          s.slideNumber = i + 1;
          s.content.latexFormulas = s.content.latexFormulas || s.content.formulas;
          delete s.content.formulas;
          s.voiceScript = s.voiceScript.replace(/\$[^$]*\$/g, ' the formula on screen ');
        });
        payloadText = JSON.stringify(fixed);
      } else {
        // First attempt: fenced, imperfect — exactly what a small local model does.
        payloadText = '```json\n' + JSON.stringify(messyLecture('Rotational motion', 'JEE Advanced')) + '\n```';
      }

      const json = { 'content-type': 'application/json' };
      if (mode === 'ollama' && url === '/api/tags') {
        res.writeHead(200, json);
        return res.end(JSON.stringify({ models: [{ name: 'qwen2.5:3b-instruct' }, { name: 'llama3.2:1b' }] }));
      }
      if (url === '/api/chat') {
        res.writeHead(200, json);
        return res.end(JSON.stringify({ model: 'qwen2.5:3b-instruct (mock)', message: { role: 'assistant', content: payloadText } }));
      }
      if (url.endsWith('/models')) {
        res.writeHead(200, json);
        return res.end(JSON.stringify({ data: [{ id: 'qwen2.5-3b-instruct' }] }));
      }
      if (url.endsWith('/chat/completions')) {
        res.writeHead(200, json);
        return res.end(
          JSON.stringify({ model: 'qwen2.5-3b-instruct (mock)', choices: [{ message: { role: 'assistant', content: payloadText } }] })
        );
      }
      res.writeHead(404, json);
      res.end(JSON.stringify({ error: 'not found' }));
    });
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      resolve({
        server,
        calls,
        port: server.address().port,
        baseUrl(mode2 = mode) {
          return mode2 === 'ollama'
            ? `http://127.0.0.1:${server.address().port}`
            : `http://127.0.0.1:${server.address().port}/v1`;
        },
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

module.exports = { start, messyLecture, messyPractice };
