export class BuyMenu {
  constructor(player, weaponSystem, audio) {
    this.player = player;
    this.weaponSystem = weaponSystem;
    this.audio = audio;
    this.isOpen = false;
    this.selectedWeapon = 'vandal';
    this.selectedShield = 25;
    this.setupUI();
  }

  setupUI() {
    document.getElementById('openBuyDemo')?.addEventListener('click', () => this.open());
    document.getElementById('buyClose')?.addEventListener('click', () => this.close());
    document.getElementById('buyConfirm')?.addEventListener('click', () => this.confirmBuy());

    document.querySelectorAll('#buyMenu .buy-item[data-weapon]').forEach(el => {
      el.addEventListener('click', () => {
        document.querySelectorAll('#buyMenu .buy-item[data-weapon]').forEach(b => b.classList.remove('selected'));
        el.classList.add('selected');
        this.selectedWeapon = el.dataset.weapon;
        this.updatePreview();
      });
    });

    document.querySelectorAll('#buyMenu .buy-item[data-shield]').forEach(el => {
      el.addEventListener('click', () => {
        document.querySelectorAll('#buyMenu .buy-item[data-shield]').forEach(b => b.classList.remove('selected'));
        el.classList.add('selected');
        this.selectedShield = parseInt(el.dataset.shield);
      });
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyB' && this.player.gameStarted) {
        if (this.isOpen) this.close();
        else this.open();
      }
      if (e.code === 'Enter' && this.isOpen) this.confirmBuy();
    });
  }

  open() {
    if (!this.player.gameStarted) return;
    this.isOpen = true;
    document.getElementById('buyMenu').classList.add('open');
    document.getElementById('buyCredits').textContent = `$${this.player.credits}`;
    this.updatePreview();
    if (this.player.controls) this.player.controls.unlock();
  }

  close() {
    this.isOpen = false;
    document.getElementById('buyMenu').classList.remove('open');
    if (this.player.gameStarted && this.player.controls) this.player.controls.lock();
  }

  updatePreview() {
    const weaponData = {
      vandal: { dmg: '39 / 156', rpm: '600 RPM', mag: '25', pen: 'MEDIUM', spread: '0.0015', range: '120M' },
      phantom: { dmg: '35 / 140', rpm: '660 RPM', mag: '30', pen: 'MEDIUM', spread: '0.0012', range: '100M' },
      operator: { dmg: '255 / 255', rpm: '36 RPM', mag: '5', pen: 'HIGH', spread: '0.0002', range: '200M' },
      sheriff: { dmg: '55 / 159', rpm: '240 RPM', mag: '6', pen: 'HIGH', spread: '0.0035', range: '80M' },
      classic: { dmg: '26 / 78', rpm: '400 RPM', mag: '12', pen: 'LOW', spread: '0.003', range: '60M' },
    };
    const data = weaponData[this.selectedWeapon];
    if (!data) return;
    document.getElementById('statDmg').textContent = data.dmg;
    document.getElementById('statRpm').textContent = data.rpm;
    document.getElementById('statMag').textContent = data.mag;
    document.getElementById('statPen').textContent = data.pen;
    document.getElementById('statSpread').textContent = data.spread;
    document.getElementById('statRange').textContent = data.range;
    document.getElementById('buyPreview').textContent = this.selectedWeapon.toUpperCase();
  }

  confirmBuy() {
    const weaponPrices = { vandal: 2900, phantom: 2900, operator: 4700, sheriff: 800, classic: 0 };
    const shieldPrices = { 0: 0, 25: 400, 50: 1000 };

    const weaponCost = weaponPrices[this.selectedWeapon] || 0;
    const shieldCost = shieldPrices[this.selectedShield] || 0;
    const total = weaponCost + shieldCost;

    if (this.player.credits < total) {
      this.audio.play('empty');
      return;
    }

    this.player.credits -= total;
    const result = this.weaponSystem.buyWeapon(this.selectedWeapon, 99999); // already deducted
    if (result.success) {
      this.player.armor = this.selectedShield;
      this.audio.play('buy');
      this.close();
      this.player.updateHUD();
    }
  }
}
