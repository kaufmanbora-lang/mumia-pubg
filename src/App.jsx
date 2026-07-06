import { useEffect, useMemo, useRef, useState } from 'react';
import items from './items.generated.json';

const ITEM_BY_ID = new Map(items.map((item) => [item.id, item]));
const POINTS_PER_SPIN = 540;
const STORAGE_KEYS = {
  inventory: 'mummy-roulette.inventory',
  points: 'mummy-roulette.points',
  spins: 'mummy-roulette.spins'
};

const RARITY_ORDER = ['gold', 'red', 'purple', 'blue', 'gray'];
const RARITY = {
  gold: {
    label: 'Золотые',
    single: 'Золотой',
    chance: 0.09,
    color: '#ffd229'
  },
  red: {
    label: 'Красные',
    single: 'Красный',
    chance: 0.71,
    color: '#ff3434'
  },
  purple: {
    label: 'Фиолетовые',
    single: 'Фиолетовый',
    chance: 5.05,
    color: '#d64dff'
  },
  blue: {
    label: 'Синие',
    single: 'Синий',
    chance: 55.65,
    color: '#3f8dff'
  },
  gray: {
    label: 'Серые',
    single: 'Серый',
    chance: 38.5,
    color: '#a8b1c2'
  }
};

const CRATES = [
  'Ящик мумии',
  'Ящик воина',
  'Ящик призраков',
  'Ящик пустыни',
  'Ящик кибер',
  'Классический ящик'
];

const ITEM_NAME_SEEDS = {
  choiceBox: 'Бокс выбора золота',
  gold: ['Золотой комплект мумии', 'Парный костюм мумии', 'Синий костюм мумии', 'Огненные повязки'],
  red: ['Красный образ', 'Эффект победы', 'Ритуальная эмоция', 'Алый скин', 'Проклятый артефакт'],
  purple: ['Фиолетовый скин', 'Оружейный камуфляж', 'Маска события', 'Рюкзак мумии', 'Граната духов'],
  blue: ['Синий жетон', 'Купон ящика', 'Краска мастерской', 'След парашюта'],
  gray: ['Обычный жетон', 'Материал', 'Малый купон', 'Набор припасов']
};

function publicPath(path) {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
}

function itemImageLabel(item) {
  return item?.name || item?.id || 'item';
}

function normalizeItem(item) {
  const catalogItem = ITEM_BY_ID.get(item?.id);
  return catalogItem ? { ...item, ...catalogItem } : item;
}

function getItemName(item) {
  if (item.kind === 'choiceBox') {
    return ITEM_NAME_SEEDS.choiceBox;
  }
  const number = Number(item.id.split('-')[1] || 1);
  const names = ITEM_NAME_SEEDS[item.rarity] || ['Предмет'];
  return `${names[(number - 1) % names.length]} ${number}`;
}

function readStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function BackIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M20 6 10 16l10 10" />
    </svg>
  );
}

function ChestIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M8 18h32v20H8z" />
      <path d="M11 18c1-8 7-12 13-12s12 4 13 12" />
      <path d="M8 26h32M24 18v20M19 25h10v8H19z" />
    </svg>
  );
}

function GiftIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M8 19h32v23H8zM5 12h38v9H5zM24 12v30" />
      <path d="M24 12c-5-9-14-6-12 0 1 4 8 4 12 0Zm0 0c5-9 14-6 12 0-1 4-8 4-12 0Z" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M20 5h8l2 6 6-2 5 7-5 5 1 6 6 4-4 8-7-2-5 4-1 7h-8l-2-7-5-4-7 2-4-8 6-4 1-6-5-5 5-7 6 2 6-2Z" />
      <circle cx="24" cy="24" r="7" />
    </svg>
  );
}

function App() {
  const [inventory, setInventory] = useState(() => readStorage(STORAGE_KEYS.inventory, []));
  const [points, setPoints] = useState(() => readStorage(STORAGE_KEYS.points, 0));
  const [spins, setSpins] = useState(() => readStorage(STORAGE_KEYS.spins, 0));
  const [drops, setDrops] = useState([]);
  const [revealed, setRevealed] = useState([]);
  const [isRolling, setIsRolling] = useState(false);
  const [stageOpen, setStageOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [inventoryFilter, setInventoryFilter] = useState('all');
  const [scorePulse, setScorePulse] = useState(false);
  const [detailsMessageVisible, setDetailsMessageVisible] = useState(false);
  const [choiceQueue, setChoiceQueue] = useState([]);
  const [pendingChoices, setPendingChoices] = useState([]);
  const audioRef = useRef(null);
  const timersRef = useRef([]);

  const itemsByRarity = useMemo(() => {
    return items.reduce((groups, item) => {
      groups[item.rarity] = groups[item.rarity] || [];
      groups[item.rarity].push(item);
      return groups;
    }, {});
  }, []);

  const showcaseItems = useMemo(() => {
    const wanted = ['gold', 'gold', 'gold', 'red', 'red', 'purple', 'purple', 'blue', 'gray'];
    return wanted.map((rarity, index) => {
      const rarityItems = itemsByRarity[rarity] || items;
      return rarityItems[index % rarityItems.length];
    });
  }, [itemsByRarity]);

  const catalogItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const rarityDiff = RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity);
      return rarityDiff || a.id.localeCompare(b.id);
    });
  }, []);

  const inventoryGroups = useMemo(() => {
    const map = new Map();
    for (const drop of inventory) {
      const normalizedDrop = normalizeItem(drop);
      const stored = map.get(normalizedDrop.id);
      if (stored) {
        stored.count += 1;
      } else {
        map.set(normalizedDrop.id, { ...normalizedDrop, count: 1 });
      }
    }
    return [...map.values()].sort((a, b) => {
      const rarityDiff = RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity);
      return rarityDiff || a.id.localeCompare(b.id);
    });
  }, [inventory]);

  const goldChoices = useMemo(() => {
    return (itemsByRarity.gold || []).filter((item) => item.kind !== 'choiceBox');
  }, [itemsByRarity]);

  const filteredInventory = useMemo(() => {
    if (inventoryFilter === 'all') {
      return inventoryGroups;
    }
    return inventoryGroups.filter((item) => item.rarity === inventoryFilter);
  }, [inventoryFilter, inventoryGroups]);

  const inventoryStats = useMemo(() => {
    return RARITY_ORDER.reduce((stats, rarity) => {
      stats[rarity] = inventory.filter((item) => normalizeItem(item).rarity === rarity).length;
      return stats;
    }, {});
  }, [inventory]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.inventory, JSON.stringify(inventory));
  }, [inventory]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.points, JSON.stringify(points));
  }, [points]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.spins, JSON.stringify(spins));
  }, [spins]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
    };
  }, []);

  function getAudioContext() {
    if (!audioRef.current) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioRef.current = new AudioContext();
    }
    if (audioRef.current.state === 'suspended') {
      audioRef.current.resume();
    }
    return audioRef.current;
  }

  function playTone(frequency, duration, delay = 0, type = 'triangle', gainValue = 0.08) {
    const ctx = getAudioContext();
    const start = ctx.currentTime + delay;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  function playOpenSound() {
    const ctx = getAudioContext();
    const start = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(78, start);
    oscillator.frequency.exponentialRampToValueAtTime(34, start + 0.42);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.48);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.52);
    playTone(420, 0.09, 0.12, 'square', 0.04);
    playTone(540, 0.1, 0.22, 'square', 0.035);
  }

  function playFeaturedSound(index) {
    const offset = index * 0.012;
    playTone(660, 0.16, offset, 'triangle', 0.06);
    playTone(880, 0.16, offset + 0.04, 'triangle', 0.055);
    playTone(1180, 0.22, offset + 0.08, 'sine', 0.045);
  }

  function playRevealSound() {
    playTone(220, 0.07, 0, 'square', 0.045);
    playTone(330, 0.08, 0.035, 'triangle', 0.035);
  }

  function clearTimers() {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }

  function pickRarity() {
    let value = Math.random() * 100;
    for (const rarity of RARITY_ORDER) {
      value -= RARITY[rarity].chance;
      if (value <= 0) {
        return rarity;
      }
    }
    return 'gray';
  }

  function pickItem() {
    const rarity = pickRarity();
    const pool = itemsByRarity[rarity] || items;
    const item = pool[Math.floor(Math.random() * pool.length)];
    return {
      ...item,
      dropUid: `${Date.now()}-${Math.random().toString(16).slice(2)}`
    };
  }

  function openCrate(count) {
    if (isRolling) {
      return;
    }

    clearTimers();
    const nextDrops = Array.from({ length: count }, pickItem);
    setDrops(nextDrops);
    setRevealed(Array(count).fill(false));
    setPendingChoices([]);
    setStageOpen(true);
    setIsRolling(true);
    playOpenSound();

    nextDrops.forEach((drop, index) => {
      const delay = 520 + index * 360;
      const revealTimer = setTimeout(() => {
        setRevealed((current) => current.map((value, currentIndex) => currentIndex === index || value));
        if (index < 5) {
          playFeaturedSound(index);
        } else {
          playRevealSound();
        }
      }, delay);
      timersRef.current.push(revealTimer);
    });

    const finishTimer = setTimeout(() => {
      const stampedDrops = nextDrops.map((drop) => ({
        ...drop,
        openedAt: new Date().toISOString()
      }));
      const directDrops = stampedDrops.filter((drop) => drop.kind !== 'choiceBox');
      const choiceDrops = stampedDrops.filter((drop) => drop.kind === 'choiceBox');
      if (directDrops.length) {
        setInventory((current) => [...directDrops, ...current]);
      }
      if (choiceDrops.length) {
        setPendingChoices(choiceDrops);
      }
      setPoints((current) => current + POINTS_PER_SPIN);
      setSpins((current) => current + 1);
      setIsRolling(false);
      setScorePulse(true);
      const pulseTimer = setTimeout(() => setScorePulse(false), 700);
      timersRef.current.push(pulseTimer);
    }, 520 + count * 360 + 520);
    timersRef.current.push(finishTimer);
  }

  function closeStage() {
    setStageOpen(false);
    if (pendingChoices.length) {
      setChoiceQueue((current) => [...current, ...pendingChoices]);
      setPendingChoices([]);
    }
  }

  function chooseGoldItem(item) {
    const choice = choiceQueue[0];
    if (!choice) {
      return;
    }
    const chosenDrop = {
      ...item,
      name: getItemName(item),
      dropUid: `${choice.dropUid}-selected-${item.id}`,
      openedAt: new Date().toISOString(),
      selectedFrom: choice.id
    };
    setInventory((current) => [chosenDrop, ...current]);
    setChoiceQueue((current) => current.slice(1));
    playFeaturedSound(0);
  }

  function clearInventory() {
    if (isRolling) {
      return;
    }
    setInventory([]);
  }

  const sceneStyle = {
    '--scene-image': `url(${publicPath('/assets/concept-mummy-scene.jpg')})`
  };

  return (
    <div className="app" style={sceneStyle}>
      <header className="topbar">
        <button className="icon-button back-button" aria-label="Назад">
          <BackIcon />
        </button>
        <div className="brand-lockup">
          <div className="brand-icon">
            <ChestIcon />
          </div>
          <h1>Ящик мумии</h1>
        </div>
        <div className="top-currency">
          <div className="currency-chip">
            <span className="currency-badge">UC</span>
            <strong>55</strong>
            <button aria-label="Добавить UC">+</button>
          </div>
          <div className="currency-chip purple">
            <span className="gem" />
            <strong>{inventory.length}</strong>
            <button aria-label="Добавить кристаллы">+</button>
          </div>
          <button className="inventory-top" onClick={() => setInventoryOpen(true)}>
            Инвентарь
          </button>
          <button className="icon-button" aria-label="Ящик">
            <GiftIcon />
          </button>
          <button className="icon-button" aria-label="Настройки">
            <GearIcon />
          </button>
        </div>
      </header>

      <aside className={`points-card ${scorePulse ? 'pulse' : ''}`}>
        <span>Очки за прокрут</span>
        <strong>+{POINTS_PER_SPIN}</strong>
        <span>очков</span>
        <div className="points-total">
          <small>Всего</small>
          <b>{points}</b>
        </div>
      </aside>

      <section className="scene-status" aria-label="Статистика рулетки">
        <div>
          <span>Прокрутов</span>
          <strong>{spins}</strong>
        </div>
        <div>
          <span>Сохранено</span>
          <strong>{inventory.length}</strong>
        </div>
      </section>

      <main className="loot-panel" aria-label="Рулетка ящика мумии">
        <div className="panel-tabs">
          <button className="panel-tab active" type="button" onClick={() => setDetailsMessageVisible((visible) => !visible)}>
            <span className="question">?</span>
            Детали
          </button>
          <div className="panel-tab timer">
            <span className="clock" />
            63 дня
          </div>
          <button className="panel-reset" aria-label="Назад">
            ↩
          </button>
        </div>

        {detailsMessageVisible && (
          <div className="details-love" role="status" aria-live="polite">
            <span>Настя</span>
            <strong>❤️</strong>
          </div>
        )}

        <div className="prize-grid" aria-label="Все предметы ящика">
          {catalogItems.map((item, index) => (
            <PrizeCard key={`${item.id}-${index}`} item={item} index={index} compact />
          ))}
        </div>

        <div className="progress-row">
          <div className="progress-cell checked">
            <span>✓</span>
            <strong>30/30</strong>
          </div>
          <div className="progress-cell">
            <GiftIcon />
            <strong>0/50</strong>
          </div>
          <button className="progress-cell box-link" onClick={() => setInventoryOpen(true)}>
            <ChestIcon />
          </button>
        </div>

        <div className="odds-strip">
          {RARITY_ORDER.map((rarity) => (
            <div className="odds-item" key={rarity}>
              <span style={{ backgroundColor: RARITY[rarity].color }} />
              <b>{RARITY[rarity].label}</b>
              <em>{RARITY[rarity].chance}%</em>
            </div>
          ))}
        </div>

        <div className="open-actions">
          <button className="open-button single" onClick={() => openCrate(1)} disabled={isRolling}>
            <span>Открыть 1 раз</span>
            <strong>Бесплатно</strong>
          </button>
          <button className="open-button ten" onClick={() => openCrate(10)} disabled={isRolling}>
            <span>Открыть 10 раз</span>
            <strong>Бесплатно</strong>
          </button>
        </div>
      </main>

      <aside className="crate-menu" aria-label="Меню ящиков">
        {CRATES.map((crate, index) => {
          const item = showcaseItems[index % showcaseItems.length];
          return (
            <button className={`crate-card ${index === 0 ? 'selected' : ''}`} key={crate}>
              <ItemImage item={item} decorative />
              <span>{crate}</span>
            </button>
          );
        })}
        <button className="crate-arrow" aria-label="Показать еще">
          ˅
        </button>
      </aside>

      {stageOpen && (
        <section className="roll-stage" aria-live="polite">
          <div className="roll-stage-panel">
            <div className="roll-stage-header">
              <div>
                <span>Результат прокрута</span>
                <strong>{isRolling ? 'Открываем карты' : 'Предметы сохранены'}</strong>
              </div>
              <button disabled={isRolling} onClick={closeStage}>
                {isRolling ? '...' : 'Забрать'}
              </button>
            </div>
            <div className={`result-grid count-${drops.length}`}>
              {drops.map((drop, index) => (
                <ResultCard
                  key={drop.dropUid}
                  item={drop}
                  index={index}
                  revealed={revealed[index]}
                  featured={index < 5}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {choiceQueue.length > 0 && (
        <section className="choice-modal" aria-modal="true" role="dialog">
          <div className="choice-panel">
            <div className="choice-title">
              <span>Выпал бокс выбора</span>
              <strong>Выбери золотой предмет</strong>
              <em>Осталось боксов: {choiceQueue.length}</em>
            </div>
            <div className="choice-grid">
              {goldChoices.map((item) => (
                <button className="choice-card" key={item.id} onClick={() => chooseGoldItem(item)}>
                  <ItemImage item={item} decorative />
                  <span>Выбрать</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      <aside className={`inventory-drawer ${inventoryOpen ? 'open' : ''}`} aria-hidden={!inventoryOpen}>
        <div className="inventory-head">
          <div>
            <span>Сохраненные предметы</span>
            <strong>Инвентарь</strong>
          </div>
          <button onClick={() => setInventoryOpen(false)}>×</button>
        </div>

        <div className="inventory-summary">
          <div>
            <span>Всего</span>
            <strong>{inventory.length}</strong>
          </div>
          <div>
            <span>Очки</span>
            <strong>{points}</strong>
          </div>
          <div>
            <span>Прокрутов</span>
            <strong>{spins}</strong>
          </div>
        </div>

        <div className="filter-row">
          <button className={inventoryFilter === 'all' ? 'active' : ''} onClick={() => setInventoryFilter('all')}>
            Все
          </button>
          {RARITY_ORDER.map((rarity) => (
            <button
              key={rarity}
              className={inventoryFilter === rarity ? 'active' : ''}
              onClick={() => setInventoryFilter(rarity)}
            >
              <span style={{ backgroundColor: RARITY[rarity].color }} />
              {inventoryStats[rarity]}
            </button>
          ))}
        </div>

        <div className="inventory-grid">
          {filteredInventory.length === 0 ? (
            <div className="empty-inventory">
              <ChestIcon />
              <strong>Пока пусто</strong>
              <span>Нажми «Открыть 10 раз», и предметы появятся здесь.</span>
            </div>
          ) : (
            filteredInventory.map((item) => <InventoryItem key={item.id} item={item} />)
          )}
        </div>

        <div className="inventory-footer">
          <button onClick={clearInventory} disabled={inventory.length === 0 || isRolling}>
            Очистить
          </button>
          <button className="primary" onClick={() => openCrate(10)} disabled={isRolling}>
            Еще прокрут
          </button>
        </div>
      </aside>

      {inventoryOpen && <button className="drawer-backdrop" aria-label="Закрыть инвентарь" onClick={() => setInventoryOpen(false)} />}
    </div>
  );
}

function PrizeCard({ item, compact = false }) {
  return (
    <article className={`prize-card rarity-${item.rarity} ${compact ? 'compact' : ''}`}>
      <ItemImage item={item} decorative />
      <div className="rarity-corner">{RARITY[item.rarity].single}</div>
    </article>
  );
}

function ItemImage({ item, decorative = false }) {
  if (!item) {
    return null;
  }

  const label = itemImageLabel(item);
  if (!item.sprite) {
    return <img className="item-art" src={publicPath(item.image)} alt={decorative ? '' : label} />;
  }

  return (
    <svg
      className="item-art"
      viewBox={`${item.sprite.x} ${item.sprite.y} ${item.sprite.w} ${item.sprite.h}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden={decorative ? 'true' : undefined}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : label}
      focusable="false"
    >
      <image
        href={publicPath(item.image)}
        x="0"
        y="0"
        width={item.sprite.sheetWidth}
        height={item.sprite.sheetHeight}
        preserveAspectRatio="none"
      />
    </svg>
  );
}

function ResultCard({ item, index, revealed, featured }) {
  return (
    <article
      className={`result-card rarity-${item.rarity} ${revealed ? 'revealed' : ''} ${featured ? 'featured' : ''}`}
      style={{ '--delay-index': index }}
    >
      <div className="card-inner">
        <div className="card-face card-back">
          <ChestIcon />
          <span>Ящик мумии</span>
        </div>
        <div className="card-face card-front">
          <ItemImage item={item} decorative />
          <div className="result-caption">
            <span>{RARITY[item.rarity].single}</span>
          </div>
        </div>
      </div>
    </article>
  );
}

function InventoryItem({ item }) {
  return (
    <article className={`inventory-item rarity-${item.rarity}`}>
      <ItemImage item={item} decorative />
      <div>
        <strong>{RARITY[item.rarity].single}</strong>
      </div>
      <b>x{item.count}</b>
    </article>
  );
}

export default App;
