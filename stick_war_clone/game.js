// Stick War Clone - Game Logic

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game state
let gold = 100;
let enemyGold = 100; // Золото противника
let baseHealth = 1000;
let enemyBaseHealth = 1000;
let kills = 0;
let gameRunning = true;
let lastTime = 0;

// Unit types configuration
const unitTypes = {
    miner: { 
        cost: 50, 
        health: 30, 
        damage: 5, 
        speed: 60, 
        attackRange: 30, 
        attackCooldown: 1000,
        color: '#FFD700',
        width: 20,
        height: 40,
        isWorker: true
    },
    swordman: { 
        cost: 100, 
        health: 80, 
        damage: 15, 
        speed: 50, 
        attackRange: 40, 
        attackCooldown: 800,
        color: '#4169E1',
        width: 25,
        height: 50,
        isWorker: false
    },
    archer: { 
        cost: 150, 
        health: 50, 
        damage: 12, 
        speed: 45, 
        attackRange: 200, 
        attackCooldown: 1200,
        color: '#32CD32',
        width: 22,
        height: 45,
        isWorker: false,
        isRanged: true
    },
    giant: { 
        cost: 300, 
        health: 200, 
        damage: 30, 
        speed: 30, 
        attackRange: 50, 
        attackCooldown: 1500,
        color: '#8B4513',
        width: 40,
        height: 70,
        isWorker: false,
        isRanged: false
    }
};

// Arrays to store game objects
let playerUnits = [];
let enemyUnits = [];
let projectiles = [];
let goldMines = [];

// Base positions
const playerBaseX = 100;
const enemyBaseX = canvas.width - 100;
const groundY = canvas.height / 2 + 50;

// Game mode: 'defend' or 'attack'
let gameMode = 'defend';

// Initialize gold mines - closer to bases with increased health
function initMines() {
    goldMines = [
        // Player side mines (closer to player base)
        { x: playerBaseX + 150, y: groundY, health: 2000, maxHealth: 2000, owner: 'player' },
        { x: playerBaseX + 220, y: groundY - 30, health: 2000, maxHealth: 2000, owner: 'player' },
        // Enemy side mines (closer to enemy base)
        { x: enemyBaseX - 150, y: groundY, health: 2000, maxHealth: 2000, owner: 'enemy' },
        { x: enemyBaseX - 220, y: groundY - 30, health: 2000, maxHealth: 2000, owner: 'enemy' }
    ];
}

// Unit class
class Unit {
    constructor(type, isPlayer) {
        const config = unitTypes[type];
        this.type = type;
        this.isPlayer = isPlayer;
        // Add random offset to prevent stacking
        const randomOffset = (Math.random() - 0.5) * 40;
        this.x = (isPlayer ? playerBaseX + 60 : enemyBaseX - 60) + randomOffset;
        this.y = groundY;
        this.health = config.health;
        this.maxHealth = config.health;
        this.damage = config.damage;
        this.speed = config.speed;
        this.attackRange = config.attackRange;
        this.attackCooldown = config.attackCooldown;
        this.lastAttack = 0;
        this.color = config.color;
        this.width = config.width;
        this.height = config.height;
        this.isWorker = config.isWorker;
        this.isRanged = config.isRanged || false;
        this.target = null;
        this.state = 'move'; // move, attack, mine
        this.miningTarget = null;
        this.defendPosition = isPlayer ? playerBaseX + 80 : enemyBaseX - 80;
    }
    
    update(deltaTime, currentTime) {
        if (this.health <= 0) return;
        
        // Miners automatically look for mines to mine
        if (this.isWorker && !this.miningTarget) {
            this.findMineToMine();
        }
        
        // In defend mode, player's non-worker units stay near base
        // Enemy units have their own defend/attack logic based on unit count
        if (this.isPlayer && gameMode === 'defend' && !this.isWorker) {
            this.defendBehavior(deltaTime, currentTime);
            return;
        }
        
        // Enemy non-worker units: defend if less than 5 units, attack otherwise
        if (!this.isPlayer && !this.isWorker) {
            const enemyCombatUnits = enemyUnits.filter(u => !u.isWorker && u.health > 0).length;
            if (enemyCombatUnits < 5) {
                this.enemyDefendBehavior(deltaTime, currentTime);
                return;
            }
            // Otherwise fall through to attack behavior
        }
        
        if (this.state === 'mine' && this.isWorker && this.miningTarget) {
            this.mine(currentTime, deltaTime);
        } else {
            // Always look for enemy units first, then base
            this.findTarget();
            
            if (this.target && this.target.health > 0) {
                const distance = Math.abs(this.x - this.target.x);
                
                if (distance <= this.attackRange) {
                    this.state = 'attack';
                    this.attack(currentTime);
                } else {
                    this.state = 'move';
                    this.move(deltaTime);
                }
            } else {
                this.state = 'move';
                this.move(deltaTime);
            }
        }
    }
    
    defendBehavior(deltaTime, currentTime) {
        // Stay near defend position, only attack enemies that come close
        const defendX = playerBaseX + 80;
        const maxDistanceFromDefend = 150;

        // Find closest enemy unit (prioritize units over base)
        let closestEnemy = null;
        let closestDist = Infinity;

        for (const enemy of enemyUnits) {
            if (enemy.health > 0) {
                const dist = Math.abs(this.x - enemy.x);
                if (dist < closestDist) {
                    closestDist = dist;
                    closestEnemy = enemy;
                }
            }
        }

        // Only engage if enemy is within defend range
        if (closestEnemy && closestDist < maxDistanceFromDefend) {
            this.target = closestEnemy;
            const distance = Math.abs(this.x - this.target.x);

            if (distance <= this.attackRange) {
                this.state = 'attack';
                this.attack(currentTime);
            } else {
                this.state = 'move';
                const direction = this.target.x > this.x ? 1 : -1;
                this.x += this.speed * direction * deltaTime;
                // Clamp to defend area
                this.x = Math.max(playerBaseX + 50, Math.min(playerBaseX + maxDistanceFromDefend, this.x));
            }
        } else {
            // Return to defend position
            this.state = 'move';
            const distToPosition = Math.abs(this.x - defendX);
            if (distToPosition > 10) {
                const direction = defendX > this.x ? 1 : -1;
                this.x += this.speed * direction * deltaTime;
            }
        }
    }
    
    // Enemy defend behavior - stay near enemy base until 5 units
    enemyDefendBehavior(deltaTime, currentTime) {
        const defendX = enemyBaseX - 80;
        const maxDistanceFromDefend = 150;

        // Find closest player unit
        let closestEnemy = null;
        let closestDist = Infinity;

        for (const player of playerUnits) {
            if (player.health > 0) {
                const dist = Math.abs(this.x - player.x);
                if (dist < closestDist) {
                    closestDist = dist;
                    closestEnemy = player;
                }
            }
        }

        // Only engage if enemy is within defend range
        if (closestEnemy && closestDist < maxDistanceFromDefend) {
            this.target = closestEnemy;
            const distance = Math.abs(this.x - this.target.x);

            if (distance <= this.attackRange) {
                this.state = 'attack';
                this.attack(currentTime);
            } else {
                this.state = 'move';
                const direction = this.target.x < this.x ? -1 : 1;
                this.x += this.speed * direction * deltaTime;
                // Clamp to defend area
                this.x = Math.max(enemyBaseX - maxDistanceFromDefend, Math.min(enemyBaseX - 50, this.x));
            }
        } else {
            // Return to defend position
            this.state = 'move';
            const distToPosition = Math.abs(this.x - defendX);
            if (distToPosition > 10) {
                const direction = defendX > this.x ? 1 : -1;
                this.x += this.speed * direction * deltaTime;
            }
        }
    }
    
    findMineToMine() {
        let closestMine = null;
        let closestDist = Infinity;
        
        for (const mine of goldMines) {
            if (mine.health > 0) {
                // Шахтёры ищут шахты на своей стороне карты
                const isOnMySide = this.isPlayer ? 
                    mine.x < canvas.width / 2 : 
                    mine.x > canvas.width / 2;
                
                if (isOnMySide && mine.owner === (this.isPlayer ? 'player' : 'enemy')) {
                    const dist = Math.abs(this.x - mine.x);
                    if (dist < closestDist) {
                        closestDist = dist;
                        closestMine = mine;
                    }
                }
            }
        }
        
        if (closestMine) {
            this.miningTarget = closestMine;
            this.state = 'mine';
        }
    }
    
    findTarget() {
        if (this.isPlayer) {
            // Target enemy units FIRST (prioritize units over base)
            let closestEnemy = null;
            let closestDist = Infinity;
            
            for (const enemy of enemyUnits) {
                if (enemy.health > 0) {
                    const dist = Math.abs(this.x - enemy.x);
                    if (dist < closestDist) {
                        closestDist = dist;
                        closestEnemy = enemy;
                    }
                }
            }
            
            // Only target base if no enemy units nearby or very close to base
            const baseDist = Math.abs(this.x - enemyBaseX);
            if (closestEnemy && closestDist < 500) {
                // Always prioritize enemy units within range
                this.target = closestEnemy;
            } else if (baseDist < 400 || !closestEnemy) {
                this.target = { x: enemyBaseX, y: groundY, health: enemyBaseHealth, isBase: true };
            } else {
                this.target = closestEnemy;
            }
        } else {
            // Target player units FIRST (prioritize units over base)
            let closestEnemy = null;
            let closestDist = Infinity;
            
            for (const player of playerUnits) {
                if (player.health > 0) {
                    const dist = Math.abs(this.x - player.x);
                    if (dist < closestDist) {
                        closestDist = dist;
                        closestEnemy = player;
                    }
                }
            }
            
            // Only target base if no enemy units nearby or very close to base
            const baseDist = Math.abs(this.x - playerBaseX);
            if (closestEnemy && closestDist < 500) {
                // Always prioritize enemy units within range
                this.target = closestEnemy;
            } else if (baseDist < 400 || !closestEnemy) {
                this.target = { x: playerBaseX, y: groundY, health: baseHealth, isBase: true };
            } else {
                this.target = closestEnemy;
            }
        }
    }
    
    move(deltaTime) {
        const direction = this.isPlayer ? 1 : -1;
        
        // Separation: gently push away from ALL nearby units to prevent stacking
        const minSpacing = 25; // Minimum distance between units
        let separationX = 0;
        
        // Check all units (both friendly and enemy)
        const allUnits = [...playerUnits, ...enemyUnits];
        for (const other of allUnits) {
            if (other !== this && other.health > 0) {
                const dist = this.x - other.x;
                const absDist = Math.abs(dist);
                if (absDist < minSpacing && absDist > 0) {
                    // Push away from other unit
                    separationX += dist > 0 ? 1 : -1;
                }
            }
        }
        
        // Avoid friendly miners that are blocking the path
        let avoidMiner = 0;
        const avoidDistance = 60; // Distance at which to start avoiding miners
        const myUnits = this.isPlayer ? playerUnits : enemyUnits;
        
        for (const other of myUnits) {
            if (other !== this && other.health > 0 && other.isWorker) {
                const dist = this.x - other.x;
                const absDist = Math.abs(dist);
                // If miner is in front of us in the direction we're moving
                if (absDist < avoidDistance && ((direction > 0 && dist < 0) || (direction < 0 && dist > 0))) {
                    // Push away from miner
                    avoidMiner += dist > 0 ? 0.8 : -0.8;
                }
            }
        }
        
        // Apply movement with separation and miner avoidance
        const moveSpeed = this.speed * deltaTime;
        const separationStrength = 0.5; // How much separation affects movement
        const avoidStrength = 0.8; // How much to avoid miners
        
        this.x += direction * moveSpeed + separationX * separationStrength + avoidMiner * avoidStrength;
        
        // Clamp position - units cannot go behind their own base
        if (this.isPlayer) {
            this.x = Math.max(playerBaseX + 50, Math.min(enemyBaseX - 50, this.x));
        } else {
            this.x = Math.max(playerBaseX + 50, Math.min(enemyBaseX - 50, this.x));
        }
    }
    
    attack(currentTime) {
        // Ranged units don't do melee attacks
        if (this.isRanged) return;
        
        if (currentTime - this.lastAttack >= this.attackCooldown) {
            this.lastAttack = currentTime;
            
            if (this.target.isBase) {
                if (this.isPlayer) {
                    enemyBaseHealth -= this.damage;
                } else {
                    baseHealth -= this.damage;
                }
            } else if (this.target.health > 0) {
                this.target.health -= this.damage;
                if (this.target.health <= 0 && !this.target.isBase) {
                    if (this.isPlayer) {
                        kills++;
                    }
                }
            }
        }
    }
    
    mine(currentTime, deltaTime) {
        if (!this.miningTarget || this.miningTarget.health <= 0) {
            this.state = 'move';
            this.miningTarget = null;
            this.findMineToMine();
            return;
        }
        
        const distance = Math.abs(this.x - this.miningTarget.x);
        if (distance <= 50) {
            if (currentTime - this.lastAttack >= this.attackCooldown) {
                this.lastAttack = currentTime;
                this.miningTarget.health -= this.damage;
                
                // Добыча золота каждый тик атаки
                const goldMined = 5 * (this.attackCooldown / 1000); // 5 золота в секунду
                if (this.isPlayer) {
                    gold += goldMined;
                } else {
                    enemyGold += goldMined;
                }
                
                if (this.miningTarget.health <= 0) {
                    this.miningTarget = null;
                    this.state = 'move';
                    // Find another mine to mine
                    setTimeout(() => this.findMineToMine(), 100);
                }
            }
        } else {
            const direction = this.miningTarget.x > this.x ? 1 : -1;
            this.x += this.speed * direction * deltaTime;
        }
    }
    
    draw() {
        if (this.health <= 0) return;
        
        // Debug: ensure position is valid
        if (isNaN(this.x) || isNaN(this.y)) {
            console.log('Invalid position for unit', this.type, this.x, this.y);
            return;
        }
        
        ctx.save();
        
        // Draw stick figure
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 3;
        ctx.fillStyle = this.color;
        
        const x = this.x;
        const y = this.y;
        
        // Head - make it more visible
        ctx.beginPath();
        ctx.arc(x, y - this.height/2 + 5, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Body
        ctx.beginPath();
        ctx.moveTo(x, y - this.height/2 + 15);
        ctx.lineTo(x, y - this.height/4);
        ctx.stroke();
        
        // Arms
        ctx.beginPath();
        if (this.state === 'attack') {
            // Attack pose
            ctx.moveTo(x, y - this.height/3);
            ctx.lineTo(x + (this.isPlayer ? 15 : -15), y - this.height/3);
        } else {
            // Normal pose
            ctx.moveTo(x - 10, y - this.height/3);
            ctx.lineTo(x + 10, y - this.height/3);
        }
        ctx.stroke();
        
        // Legs - make them more visible
        ctx.beginPath();
        ctx.moveTo(x, y - this.height/4);
        ctx.lineTo(x - 10, y);
        ctx.moveTo(x, y - this.height/4);
        ctx.lineTo(x + 10, y);
        ctx.stroke();
        
        // Weapon
        if (this.type === 'swordman') {
            ctx.beginPath();
            ctx.strokeStyle = '#C0C0C0';
            ctx.lineWidth = 4;
            if (this.isPlayer) {
                ctx.moveTo(x + 10, y - this.height/3);
                ctx.lineTo(x + 25, y - this.height/2);
            } else {
                ctx.moveTo(x - 10, y - this.height/3);
                ctx.lineTo(x - 25, y - this.height/2);
            }
            ctx.stroke();
        } else if (this.type === 'archer') {
            ctx.beginPath();
            ctx.strokeStyle = '#8B4513';
            ctx.lineWidth = 2;
            ctx.arc(x + (this.isPlayer ? 15 : -15), y - this.height/2, 15, -Math.PI/4, Math.PI/4, !this.isPlayer);
            ctx.stroke();
        } else if (this.type === 'miner') {
            ctx.beginPath();
            ctx.strokeStyle = '#FFA500';
            ctx.lineWidth = 3;
            if (this.isPlayer) {
                ctx.moveTo(x + 10, y - this.height/3);
                ctx.lineTo(x + 20, y - this.height/2 - 5);
            } else {
                ctx.moveTo(x - 10, y - this.height/3);
                ctx.lineTo(x - 20, y - this.height/2 - 5);
            }
            ctx.stroke();
        }
        
        // Health bar - make it more visible
        const healthBarWidth = 40;
        const healthPercent = this.health / this.maxHealth;
        ctx.fillStyle = '#FF0000';
        ctx.fillRect(x - healthBarWidth/2, y - this.height/2 - 20, healthBarWidth, 6);
        ctx.fillStyle = '#00FF00';
        ctx.fillRect(x - healthBarWidth/2, y - this.height/2 - 20, healthBarWidth * healthPercent, 6);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - healthBarWidth/2, y - this.height/2 - 20, healthBarWidth, 6);
        
        ctx.restore();
    }
}

// Projectile class for ranged attacks
class Projectile {
    constructor(x, y, targetX, targetY, damage, isPlayer) {
        this.x = x;
        this.y = y;
        this.targetX = targetX;
        this.targetY = targetY;
        this.damage = damage;
        this.speed = 300;
        this.active = true;
        this.isPlayer = isPlayer;
        
        const dx = targetX - x;
        const dy = targetY - y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        this.vx = (dx / dist) * this.speed;
        this.vy = (dy / dist) * this.speed;
    }
    
    update(deltaTime) {
        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;
        
        // Check if reached target area
        const dist = Math.sqrt(Math.pow(this.x - this.targetX, 2) + Math.pow(this.y - this.targetY, 2));
        if (dist < 20) {
            this.active = false;
            // Hit enemy units in area
            for (const unit of this.isPlayer ? enemyUnits : playerUnits) {
                if (unit.health > 0) {
                    const unitDist = Math.sqrt(Math.pow(this.x - unit.x, 2) + Math.pow(this.y - unit.y, 2));
                    // Use larger hit radius for bigger units (giants)
                    const hitRadius = unit.width > 30 ? 50 : 30;
                    if (unitDist < hitRadius) {
                        unit.health -= this.damage;
                        if (unit.health <= 0 && this.isPlayer) {
                            kills++;
                        }
                    }
                }
            }
            // Also check if hitting enemy base
            if (this.isPlayer) {
                const baseDist = Math.sqrt(Math.pow(this.x - enemyBaseX, 2) + Math.pow(this.y - groundY, 2));
                if (baseDist < 60) {
                    enemyBaseHealth -= this.damage;
                }
            } else {
                const baseDist = Math.sqrt(Math.pow(this.x - playerBaseX, 2) + Math.pow(this.y - groundY, 2));
                if (baseDist < 60) {
                    baseHealth -= this.damage;
                }
            }
        }
    }
    
    draw() {
        if (!this.active) return;
        
        ctx.beginPath();
        ctx.fillStyle = '#FFD700';
        ctx.arc(this.x, this.y, 5, 0, Math.PI * 2);
        ctx.fill();
    }
}

// Spawn unit function
function spawnUnit(type) {
    if (!gameRunning) return;
    
    const cost = unitTypes[type].cost;
    if (gold >= cost) {
        gold -= cost;
        playerUnits.push(new Unit(type, true));
        updateUI();
    }
}

// Enemy spawn logic - AI that mines gold and spawns units
let enemySpawnTimer = 0;
let enemySpawnInterval = 10000; // Initial spawn interval

function spawnEnemy() {
    const types = ['swordman', 'archer', 'giant'];
    const randomType = types[Math.floor(Math.random() * types.length)];
    enemyUnits.push(new Unit(randomType, false));
}

// Вражеский ИИ: добыча золота и найм юнитов
let enemyMinerSpawnTimer = 0;
let enemyMinerSpawnInterval = 3000; // Спавн шахтёров каждые 3 секунды

function updateEnemyAI(deltaTime) {
    // Спавн шахтёров для добычи золота
    enemyMinerSpawnTimer += deltaTime * 1000;
    if (enemyMinerSpawnTimer >= enemyMinerSpawnInterval && enemyGold >= unitTypes.miner.cost) {
        enemyMinerSpawnTimer = 0;
        enemyGold -= unitTypes.miner.cost;
        const miner = new Unit('miner', false);
        miner.state = 'mine';
        miner.findMineToMine();
        enemyUnits.push(miner);
    }
    
    // Найм боевых юнитов если накоплено достаточно золота
    if (enemyGold >= unitTypes.swordman.cost) {
        const combatTypes = ['swordman', 'archer', 'giant'];
        const weights = [0.5, 0.35, 0.15]; // Вероятности выбора
        
        const rand = Math.random();
        let selectedType = 'swordman';
        let cumulative = 0;
        
        for (let i = 0; i < combatTypes.length; i++) {
            cumulative += weights[i];
            if (rand <= cumulative) {
                selectedType = combatTypes[i];
                break;
            }
        }
        
        if (enemyGold >= unitTypes[selectedType].cost) {
            enemyGold -= unitTypes[selectedType].cost;
            enemyUnits.push(new Unit(selectedType, false));
        }
    }
}

// Update UI
function updateUI() {
    document.getElementById('gold').textContent = Math.floor(gold);
    document.getElementById('baseHealth').textContent = Math.floor(baseHealth);
    document.getElementById('kills').textContent = kills;
    
    // Update button states
    const buttons = document.querySelectorAll('.unit-btn');
    buttons[0].disabled = gold < unitTypes.miner.cost;
    buttons[1].disabled = gold < unitTypes.swordman.cost;
    buttons[2].disabled = gold < unitTypes.archer.cost;
    buttons[3].disabled = gold < unitTypes.giant.cost;
    
    // Обновляем золото противника (для отладки)
    const enemyGoldEl = document.getElementById('enemyGold');
    if (enemyGoldEl) {
        enemyGoldEl.textContent = Math.floor(enemyGold);
    }
    
    // Обновляем здоровье базы врага
    const enemyBaseHealthEl = document.getElementById('enemyBaseHealthDisplay');
    if (enemyBaseHealthEl) {
        enemyBaseHealthEl.textContent = Math.max(0, Math.floor(enemyBaseHealth));
    }
}

// Draw background
function drawBackground() {
    // Sky
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#87CEEB');
    gradient.addColorStop(0.5, '#E0F6FF');
    gradient.addColorStop(0.5, '#90EE90');
    gradient.addColorStop(1, '#228B22');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Ground line
    ctx.strokeStyle = '#654321';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(canvas.width, groundY);
    ctx.stroke();
    
    // Ground fill
    ctx.fillStyle = '#8B7355';
    ctx.fillRect(0, groundY, canvas.width, canvas.height - groundY);
    
    // Player base
    ctx.fillStyle = '#4169E1';
    ctx.fillRect(playerBaseX - 40, groundY - 80, 80, 80);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '40px Arial';
    ctx.fillText('🏰', playerBaseX - 25, groundY - 30);
    
    // Enemy base
    ctx.fillStyle = '#DC143C';
    ctx.fillRect(enemyBaseX - 40, groundY - 80, 80, 80);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('💀', enemyBaseX - 25, groundY - 30);
    
    // Enemy base health bar
    const enemyBaseHealthBarWidth = 100;
    const enemyBaseHealthPercent = Math.max(0, enemyBaseHealth / 1000);
    ctx.fillStyle = '#FF0000';
    ctx.fillRect(enemyBaseX - enemyBaseHealthBarWidth/2, groundY - 95, enemyBaseHealthBarWidth, 10);
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(enemyBaseX - enemyBaseHealthBarWidth/2, groundY - 95, enemyBaseHealthBarWidth * enemyBaseHealthPercent, 10);
    
    // Gold mines
    for (const mine of goldMines) {
        if (mine.health > 0) {
            ctx.fillStyle = '#FFD700';
            ctx.beginPath();
            ctx.arc(mine.x, mine.y, 30, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#000000';
            ctx.font = '20px Arial';
            ctx.fillText('💰', mine.x - 10, mine.y + 7);
            
            // Mine health bar
            const healthBarWidth = 60;
            const healthPercent = mine.health / mine.maxHealth;
            ctx.fillStyle = '#FF0000';
            ctx.fillRect(mine.x - healthBarWidth/2, mine.y - 45, healthBarWidth, 8);
            ctx.fillStyle = '#00FF00';
            ctx.fillRect(mine.x - healthBarWidth/2, mine.y - 45, healthBarWidth * healthPercent, 8);
        }
    }
}

// Game loop
function gameLoop(currentTime) {
    if (!gameRunning) return;
    
    const deltaTime = (currentTime - lastTime) / 1000;
    lastTime = currentTime;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw background
    drawBackground();
    
    // Passive gold generation
    gold += deltaTime * 2;
    
    // Вражеский ИИ: добыча золота и найм юнитов
    updateEnemyAI(deltaTime);
    
    // Spawn enemies - slower rate, less aggressive scaling (резервный механизм)
    enemySpawnTimer += deltaTime * 1000;
    if (enemySpawnTimer >= enemySpawnInterval) {
        enemySpawnTimer = 0;
        // Спавним только если у врага нет шахтёров или мало юнитов
        const enemyMiners = enemyUnits.filter(u => u.type === 'miner' && u.health > 0).length;
        if (enemyMiners === 0) {
            spawnEnemy();
        }
        // Decrease spawn interval over time, but more slowly and with higher minimum
        enemySpawnInterval = Math.max(6000, enemySpawnInterval - 20);
    }
    
    // Update and draw player units
    for (const unit of playerUnits) {
        unit.update(deltaTime, currentTime);
        unit.draw();
        
        // Archer shooting
        if (unit.isRanged && unit.state === 'attack' && unit.target) {
            const targetHasHealth = unit.target.isBase ? (unit.target.health > 0 || enemyBaseHealth > 0) : unit.target.health > 0;
            if (targetHasHealth) {
                if (currentTime - unit.lastAttack >= unit.attackCooldown / 2) {
                    projectiles.push(new Projectile(
                        unit.x, 
                        unit.y - unit.height/2, 
                        unit.target.x, 
                        unit.target.y - (unit.target.isBase ? 40 : unit.target.height/2),
                        unit.damage,
                        unit.isPlayer
                    ));
                    unit.lastAttack = currentTime;
                }
            }
        }
    }
    
    // Update and draw enemy units
    for (const unit of enemyUnits) {
        unit.update(deltaTime, currentTime);
        unit.draw();
        
        // Enemy archer shooting
        if (unit.isRanged && unit.state === 'attack' && unit.target) {
            const targetHasHealth = unit.target.isBase ? (unit.target.health > 0 || baseHealth > 0) : unit.target.health > 0;
            if (targetHasHealth) {
                if (currentTime - unit.lastAttack >= unit.attackCooldown / 2) {
                    projectiles.push(new Projectile(
                        unit.x, 
                        unit.y - unit.height/2, 
                        unit.target.x, 
                        unit.target.y - (unit.target.isBase ? 40 : unit.target.height/2),
                        unit.damage,
                        unit.isPlayer
                    ));
                    unit.lastAttack = currentTime;
                }
            }
        }
    }
    
    // Update and draw projectiles
    for (const projectile of projectiles) {
        projectile.update(deltaTime);
        projectile.draw();
    }
    
    // Remove dead units
    playerUnits = playerUnits.filter(u => u.health > 0);
    enemyUnits = enemyUnits.filter(u => u.health > 0);
    projectiles = projectiles.filter(p => p.active);
    goldMines = goldMines.filter(m => m.health > 0);
    
    // Check win/lose conditions
    if (baseHealth <= 0) {
        gameOver(false);
    } else if (enemyBaseHealth <= 0) {
        gameOver(true);
    }
    
    // Update UI
    updateUI();
    
    requestAnimationFrame(gameLoop);
}

// Game over
function gameOver(win) {
    gameRunning = false;
    const gameOverDiv = document.getElementById('gameOver');
    const gameOverText = document.getElementById('gameOverText');
    gameOverText.textContent = win ? '🎉 ПОБЕДА! 🎉' : '☠️ ПОРАЖЕНИЕ ☠️';
    gameOverText.style.color = win ? '#00FF00' : '#FF0000';
    gameOverDiv.style.display = 'block';
}

// Restart game
function restartGame() {
    gold = 100;
    baseHealth = 1000;
    enemyBaseHealth = 1000;
    kills = 0;
    playerUnits = [];
    enemyUnits = [];
    projectiles = [];
    enemySpawnTimer = 0;
    enemySpawnInterval = 10000;
    gameMode = 'defend';
    gameRunning = true;
    document.getElementById('gameOver').style.display = 'none';
    initMines();
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

// Initialize game
initMines();
lastTime = performance.now();
requestAnimationFrame(gameLoop);
