extends Object
class_name GameData

static func default_profile() -> Dictionary:
	return {
		"stage_index": 1,
		"highest_stage": 1,
		"coins": 10000,
		"unlocked_upgrades": [],
		"cleared_stages": [],
		"unlocked_features": [],
		"unlocked_supers": [],
		"active_super": null,
		"kills": 0
	}

static func player_base_stats() -> Dictionary:
	return {
		"max_hp": 150.0,
		"damage": 20.0,
		"fire_rate": 1.6,
		"move_speed": 260.0,
		"armor": 2.0,
		"projectile_speed": 880.0,
		"projectile_range": 1100.0,
		"projectile_pierce": 0,
		"splash_radius": 0.0,
		"slow_multiplier": 0.85,
		"slow_duration": 1.2,
		"shield_capacity": 20.0,
		"shield_regen": 3.0,
		"turn_speed": 10.0,
		"features": []
	}

static func clone_stats(stats: Dictionary) -> Dictionary:
	var copy := stats.duplicate(true)
	copy["features"] = stats.get("features", []).duplicate(true)
	return copy

static func upgrades() -> Array:
	return [
		{
			"id": "reinforced_hull",
			"name": "Reinforced Hull",
			"description": "Increase health and armor.",
			"cost": 55,
			"one_time": true,
			"requires": [],
			"mods": {"max_hp": 35.0, "armor": 1.5}
		},
		{
			"id": "turbo_drive",
			"name": "Turbo Drive",
			"description": "Move faster and turn quicker.",
			"cost": 60,
			"one_time": true,
			"requires": ["reinforced_hull"],
			"mods": {"move_speed": 45.0, "turn_speed": 1.5, "features_add": ["dash"]}
		},
		{
			"id": "high_caliber",
			"name": "High Caliber",
			"description": "Increase shell damage.",
			"cost": 65,
			"one_time": true,
			"requires": ["reinforced_hull"],
			"mods": {"damage": 8.0}
		},
		{
			"id": "quick_reload",
			"name": "Quick Reload",
			"description": "Fire more often.",
			"cost": 70,
			"one_time": true,
			"requires": ["high_caliber"],
			"mods": {"fire_rate": 0.35}
		},
		{
			"id": "armor_piercing",
			"name": "Armor Piercing",
			"description": "Projectiles pierce more enemies.",
			"cost": 75,
			"one_time": true,
			"requires": ["quick_reload"],
			"mods": {"projectile_pierce": 1, "features_add": ["piercing"]}
		},
		{
			"id": "explosive_rounds",
			"name": "Explosive Rounds",
			"description": "Shells explode on impact.",
			"cost": 80,
			"one_time": true,
			"requires": ["high_caliber"],
			"mods": {"damage": 4.0, "splash_radius": 60.0, "features_add": ["explosive"]}
		},
		{
			"id": "frost_shells",
			"name": "Frost Shells",
			"description": "Hits slow enemies.",
			"cost": 85,
			"one_time": true,
			"requires": ["quick_reload"],
			"mods": {"slow_multiplier": -0.12, "slow_duration": 0.5, "features_add": ["slow"]}
		},
		{
			"id": "shield_generator",
			"name": "Shield Generator",
			"description": "Add a regenerating shield buffer.",
			"cost": 95,
			"one_time": true,
			"requires": ["reinforced_hull"],
			"mods": {"shield_capacity": 25.0, "shield_regen": 4.0, "features_add": ["shield"]}
		},
		{
			"id": "rail_shells",
			"name": "Rail Shells",
			"description": "Longer range, faster projectiles, more punch.",
			"cost": 110,
			"one_time": true,
			"requires": ["armor_piercing"],
			"mods": {"damage": 10.0, "projectile_speed": 180.0, "projectile_range": 220.0, "projectile_pierce": 1, "features_add": ["rail"]}
		}
	]

static func build_upgrade_choices(profile: Dictionary, count: int = 3) -> Array:
	var pool := upgrades().duplicate(true)
	var choices: Array = []
	while choices.size() < count and pool.size() > 0:
		var index := randi() % pool.size()
		var upgrade: Dictionary = pool[index]
		pool.remove_at(index)
		if _is_upgrade_available(profile, upgrade):
			choices.append(upgrade)
	return choices

static func _is_upgrade_available(profile: Dictionary, upgrade: Dictionary) -> bool:
	var owned: Array = profile.get("unlocked_upgrades", [])
	if upgrade.get("one_time", true) and owned.has(upgrade.get("id", "")):
		return false
	for requirement in upgrade.get("requires", []):
		if not owned.has(requirement):
			return false
	return true

static func apply_upgrade(stats: Dictionary, upgrade: Dictionary) -> Dictionary:
	var copy := clone_stats(stats)
	var mods: Dictionary = upgrade.get("mods", {})
	for key in mods.keys():
		if key == "features_add":
			for feature in mods[key]:
				if not copy["features"].has(feature):
					copy["features"].append(feature)
		else:
			copy[key] = float(copy.get(key, 0.0)) + float(mods[key])
	return copy

static func build_stage(stage_index: int) -> Dictionary:
	var waves: Array = []
	var wave_count: int = int(clamp(2 + int(stage_index / 2), 2, 5))
	for wave_index in range(wave_count):
		var archetype: String = _pick_archetype(stage_index, wave_index)
		waves.append({
			"archetype": archetype,
			"count": 2 + stage_index + wave_index,
			"spawn_interval": max(0.35, 0.75 - float(stage_index) * 0.03),
			"health_mult": 1.0 + float(stage_index) * 0.16 + float(wave_index) * 0.08,
			"damage_mult": 1.0 + float(stage_index) * 0.08 + float(wave_index) * 0.05,
			"speed_mult": 1.0 + float(stage_index) * 0.03,
			"fire_rate_mult": 1.0 + float(stage_index) * 0.02
		})
	if stage_index % 5 == 0:
		waves.append({
			"archetype": "boss",
			"count": 1,
			"spawn_interval": 0.2,
			"health_mult": 3.2 + float(stage_index) * 0.35,
			"damage_mult": 2.1 + float(stage_index) * 0.16,
			"speed_mult": 0.9 + float(stage_index) * 0.01,
			"fire_rate_mult": 1.1
		})
	return {
		"stage_index": stage_index,
		"stage_id": "stage_%02d" % stage_index,
		"name": "Operation %d" % stage_index,
		"reward": 35 + (stage_index * 18),
		"boss": stage_index % 5 == 0,
		"waves": waves
	}

static func build_enemy_stats(archetype: String, stage_index: int, wave: Dictionary) -> Dictionary:
	var stats := {
		"max_hp": 80.0,
		"damage": 12.0,
		"fire_rate": 1.0,
		"move_speed": 220.0,
		"armor": 0.5,
		"projectile_speed": 760.0,
		"projectile_range": 900.0,
		"projectile_pierce": 0,
		"splash_radius": 0.0,
		"slow_multiplier": 0.9,
		"slow_duration": 0.7,
		"shield_capacity": 0.0,
		"shield_regen": 0.0,
		"turn_speed": 8.0,
		"features": []
	}
	match archetype:
		"striker":
			stats.max_hp += 15.0
			stats.damage += 5.0
			stats.move_speed += 40.0
			stats.fire_rate += 0.2
		"sniper":
			stats.max_hp -= 10.0
			stats.damage += 10.0
			stats.fire_rate += 0.45
			stats.projectile_range += 220.0
			stats.projectile_speed += 160.0
		"boss":
			stats.max_hp += 110.0
			stats.damage += 12.0
			stats.move_speed -= 35.0
			stats.fire_rate += 0.35
			stats.armor += 2.0
			stats.projectile_pierce = 1
			stats.shield_capacity = 60.0
			stats.shield_regen = 6.0
		_:
			pass
	stats.max_hp = max(20.0, stats.max_hp * float(wave.get("health_mult", 1.0)))
	stats.damage = max(5.0, stats.damage * float(wave.get("damage_mult", 1.0)))
	stats.move_speed = max(140.0, stats.move_speed * float(wave.get("speed_mult", 1.0)))
	stats.fire_rate = max(0.35, stats.fire_rate * float(wave.get("fire_rate_mult", 1.0)))
	stats.projectile_speed *= lerp(1.0, 1.2, clamp(float(stage_index) * 0.06, 0.0, 1.0))
	stats.projectile_range *= lerp(1.0, 1.15, clamp(float(stage_index) * 0.05, 0.0, 1.0))
	return stats

static func _pick_archetype(stage_index: int, wave_index: int) -> String:
	var archetypes := ["grunt", "striker", "sniper"]
	return archetypes[(stage_index + wave_index) % archetypes.size()]
