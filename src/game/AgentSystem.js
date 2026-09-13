export class AgentSystem {
  constructor() {
    this.selectedAgent = 'jett';
    this.agents = {
      jett: {
        name: 'JETT',
        role: 'DUELIST',
        description: 'Agile duelist with dash and smokes',
        abilities: {
          c: { name: 'CLOUDBURST', cost: 100, icon: '◍', desc: 'Smoke 5m 12s' },
          q: { name: 'UPDRAFT', cost: 150, icon: '↑', desc: 'Dash upward' },
          e: { name: 'TAILWIND', cost: 0, icon: '⚡', desc: 'Dash 12m' },
          x: { name: 'BLADE STORM', cost: '7 PTS', icon: '⬢', desc: '5 knives - 1 shot HS' }
        },
        color: 0x0dbef5
      },
      sova: {
        name: 'SOVA',
        role: 'INITIATOR',
        description: 'Recon specialist',
        abilities: {
          c: { name: 'OWL DRONE', cost: 100, icon: '◍', desc: 'Drone recon' },
          q: { name: 'SHOCK BOLT', cost: 100, icon: '✦', desc: 'Shock damage' },
          e: { name: 'RECON BOLT', cost: 0, icon: '◎', desc: 'Reveal 12m' },
          x: { name: 'HUNTERS FURY', cost: '7 PTS', icon: '⬢', desc: '3 wallbang shots' }
        },
        color: 0x00aaff
      },
      brim: {
        name: 'BRIMSTONE',
        role: 'CONTROLLER',
        description: 'Orbital smokes and molly',
        abilities: {
          c: { name: 'STIM BEACON', cost: 100, icon: '◍', desc: '15% fire rate' },
          q: { name: 'INCENDIARY', cost: 250, icon: '✦', desc: 'Molly 8s' },
          e: { name: 'SKY SMOKE', cost: 0, icon: '☁', desc: '3 smokes 19s' },
          x: { name: 'ORBITAL STRIKE', cost: '7 PTS', icon: '⬢', desc: 'Laser 4s' }
        },
        color: 0xff8a00
      },
      sage: {
        name: 'SAGE',
        role: 'SENTINEL',
        description: 'Healer and wall',
        abilities: {
          c: { name: 'BARRIER ORB', cost: 400, icon: '◍', desc: 'Wall 8s - 3 segments' },
          q: { name: 'SLOW ORB', cost: 200, icon: '✦', desc: 'Slow 7s' },
          e: { name: 'HEALING ORB', cost: 0, icon: '✚', desc: 'Heal 40 HP' },
          x: { name: 'RESURRECTION', cost: '8 PTS', icon: '⬢', desc: 'Revive ally' }
        },
        color: 0x00ff9d
      }
    };
    this.setupUI();
  }

  setupUI() {
    document.querySelectorAll('.agent-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.agent-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        this.selectedAgent = card.dataset.agent;
        this.updateBuyMenu();
      });
    });
  }

  updateBuyMenu() {
    const agent = this.agents[this.selectedAgent];
    if (!agent) return;
    document.getElementById('buyAgent').textContent = agent.name;
    // Update ability names in buy menu if needed
  }

  getAgent() {
    return this.agents[this.selectedAgent];
  }

  getSelectedAgentId() {
    return this.selectedAgent;
  }
}
