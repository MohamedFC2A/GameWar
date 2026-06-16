extends CharacterBody2D
class_name TankEntity

signal died(entity)
signal health_changed(current, max_value)

var team := "player"
var stats: Dictionary = {}
var body_color: Color = Color.WHITE
var turret_color: Color = Color(0.95, 0.95, 0.95, 1.0)
var ai_enabled := false
var ai_archetype := "grunt"
var target: TankEntity = null

var move_input := Vector2.ZERO
var fire_pressed := false
var hp := 1.0
var max_hp := 1.0
var shield := 0.0
var shield_capacity := 0.0
var shield_regen := 0.0
var shield_delay := 2.5
var shield_delay_timer := 0.0
var fire_cooldown := 0.0
var slow_multiplier := 1.0
var slow_timer := 0.0
var alive := true

# Polished Controls and VFX variables
var turret_rotation := 0.0
var aim_input := Vector2.ZERO
var auto_aim := true
var muzzle_flash_timer := 0.0
var shield_vfx_timer := 0.0
var smoke_spawn_timer := 0.0

var FloatingTextClass = load("res://scripts/floating_text.gd")
var SmokeVFXClass = load("res://scripts/smoke_vfx.gd")
var ExplosionVFXClass = load("res://scripts/explosion_vfx.gd")

var collision_shape: CollisionShape2D

func _ready() -> void:
	add_to_group("tanks")
	collision_layer = 1
	collision_mask = 4
	
	if collision_shape == null:
		collision_shape = CollisionShape2D.new()
		var shape := RectangleShape2D.new()
		shape.size = Vector2(52, 34)
		collision_shape.shape = shape
		add_child(collision_shape)
	queue_redraw()

func configure(source_stats: Dictionary, new_team: String, color: Color, enable_ai := false, archetype := "grunt") -> void:
	stats = source_stats.duplicate(true)
	team = new_team
	body_color = color
	turret_color = Color(1.0, 1.0, 1.0, 1.0).lerp(color, 0.15)
	ai_enabled = enable_ai
	ai_archetype = archetype
	max_hp = float(stats.get("max_hp", 100.0))
	hp = max_hp
	shield_capacity = float(stats.get("shield_capacity", 0.0))
	shield = shield_capacity
	shield_regen = float(stats.get("shield_regen", 0.0))
	shield_delay = 2.5
	shield_delay_timer = 0.0
	fire_cooldown = 0.0
	slow_multiplier = 1.0
	slow_timer = 0.0
	alive = true
	velocity = Vector2.ZERO
	rotation = 0.0
	turret_rotation = 0.0
	muzzle_flash_timer = 0.0
	shield_vfx_timer = 0.0
	smoke_spawn_timer = 0.0
	queue_redraw()
	health_changed.emit(hp, max_hp)

func set_player_input(move_axis: Vector2, fire_hold: bool, aim_axis: Vector2 = Vector2.ZERO) -> void:
	move_input = move_axis
	fire_pressed = fire_hold
	aim_input = aim_axis

func set_target(value: TankEntity) -> void:
	target = value

func apply_slow(multiplier: float, duration: float) -> void:
	slow_multiplier = min(slow_multiplier, clamp(multiplier, 0.2, 1.0))
	slow_timer = max(slow_timer, duration)

func take_damage(amount: float) -> void:
	if not alive:
		return
	var effective: float = max(1.0, amount - float(stats.get("armor", 0.0)))
	var shield_absorbed := 0.0
	if shield > 0.0:
		shield_absorbed = min(shield, effective)
		shield -= shield_absorbed
		effective -= shield_absorbed
		shield_vfx_timer = 0.35
		_spawn_floating_text("BLOCK %d" % int(shield_absorbed), Color(0.28, 0.72, 1.0))
	
	if effective > 0.0:
		hp -= effective
		_spawn_floating_text("-%d" % int(effective), Color(0.95, 0.2, 0.2) if team == "player" else Color(0.95, 0.85, 0.1))
		if team == "player" and get_tree().current_scene.has_method("add_shake"):
			get_tree().current_scene.call("add_shake", 6.0)
			
	shield_delay_timer = shield_delay
	health_changed.emit(max(hp, 0.0), max_hp)
	queue_redraw()
	if hp <= 0.0:
		_die()

func _spawn_floating_text(text_val: String, text_color: Color) -> void:
	var ft = FloatingTextClass.new()
	ft.set("text", text_val)
	ft.set("color", text_color)
	ft.global_position = global_position + Vector2(randf_range(-15, 15), randf_range(-25, -15))
	get_tree().current_scene.add_child(ft)

func _physics_process(delta: float) -> void:
	if not alive:
		return

	if slow_timer > 0.0:
		slow_timer -= delta
		if slow_timer <= 0.0:
			slow_multiplier = 1.0

	if shield < shield_capacity:
		if shield_delay_timer > 0.0:
			shield_delay_timer -= delta
		elif shield_regen > 0.0:
			shield = min(shield_capacity, shield + shield_regen * delta)

	if ai_enabled:
		_run_ai()

	var desired := move_input
	if desired.length() > 1.0:
		desired = desired.normalized()
	var move_speed := float(stats.get("move_speed", 220.0)) * slow_multiplier
	var target_velocity := desired * move_speed
	velocity = velocity.lerp(target_velocity, 12.0 * delta)
	move_and_slide()
	_clamp_to_arena()

	# Chassis rotation (pointing to movement direction)
	var face := desired
	if face.length() > 0.1:
		rotation = lerp_angle(rotation, face.angle(), float(stats.get("turn_speed", 10.0)) * delta)

	# Aiming / Turret Rotation
	var aim_dir := Vector2.ZERO
	if ai_enabled:
		if target != null and is_instance_valid(target):
			aim_dir = (target.global_position - global_position).normalized()
	else:
		if aim_input.length() > 0.1:
			aim_dir = aim_input.normalized()
		elif auto_aim:
			var nearest := _find_nearest_enemy()
			if nearest != null:
				aim_dir = (nearest.global_position - global_position).normalized()
		
		if aim_dir.length() < 0.1:
			aim_dir = Vector2.RIGHT.rotated(rotation)

	if aim_dir.length() > 0.1:
		turret_rotation = lerp_angle(turret_rotation, aim_dir.angle(), float(stats.get("turn_speed", 10.0)) * 1.2 * delta)

	# Timers
	if muzzle_flash_timer > 0.0:
		muzzle_flash_timer -= delta
	if shield_vfx_timer > 0.0:
		shield_vfx_timer -= delta
		if shield_vfx_timer <= 0.0:
			queue_redraw()

	# Dust Smoke Spawning
	if desired.length() > 0.1:
		smoke_spawn_timer += delta
		if smoke_spawn_timer >= 0.12:
			smoke_spawn_timer = 0.0
			_spawn_smoke()

	fire_cooldown -= delta
	if fire_pressed and fire_cooldown <= 0.0:
		_fire()

	z_index = int(global_position.y)
	queue_redraw()

func _find_nearest_enemy() -> TankEntity:
	var nearest: TankEntity = null
	var min_dist := 999999.0
	for tank in get_tree().get_nodes_in_group("tanks"):
		if tank == self or not is_instance_valid(tank) or not tank.alive:
			continue
		if tank.team == team:
			continue
		var dist := global_position.distance_to(tank.global_position)
		if dist < min_dist:
			min_dist = dist
			nearest = tank
	return nearest

func _spawn_smoke() -> void:
	var smoke = SmokeVFXClass.new()
	smoke.set("color", Color(0.4, 0.4, 0.4))
	smoke.global_position = global_position - Vector2.RIGHT.rotated(rotation) * 20.0
	get_tree().current_scene.add_child(smoke)

func _run_ai() -> void:
	if target == null or not is_instance_valid(target):
		target = null
		var players: Array = get_tree().get_nodes_in_group("tanks") as Array
		for tank in players:
			if tank is TankEntity and tank.team == "player":
				target = tank
				break
	if target == null:
		move_input = Vector2.ZERO
		fire_pressed = false
		return

	var to_target := target.global_position - global_position
	var distance := to_target.length()
	var forward := to_target.normalized() if distance > 0.01 else Vector2.RIGHT
	var preferred_range := 320.0
	var strafe_strength := 0.35
	match ai_archetype:
		"sniper":
			preferred_range = 440.0
			strafe_strength = 0.2
		"boss":
			preferred_range = 360.0
			strafe_strength = 0.28
		"striker":
			preferred_range = 280.0
			strafe_strength = 0.45
		_:
			pass

	var move := Vector2.ZERO
	if distance > preferred_range + 60.0:
		move = forward
	elif distance < preferred_range * 0.7:
		move = -forward

	var side := Vector2(-forward.y, forward.x)
	move += side * strafe_strength
	move_input = move
	fire_pressed = distance <= preferred_range + 120.0

func _fire() -> void:
	fire_cooldown = 1.0 / max(0.2, float(stats.get("fire_rate", 1.0)))
	muzzle_flash_timer = 0.06
	
	var projectile := TankProjectile.new()
	var fire_dir := Vector2.RIGHT.rotated(turret_rotation)
	projectile.global_position = global_position + fire_dir * 36.0
	projectile.configure(stats, team, fire_dir, self, body_color.lightened(0.2))
	
	var parent_node = get_parent()
	if parent_node != null:
		parent_node.add_child(projectile)
	else:
		get_tree().current_scene.add_child(projectile)
	
	if team == "player" and get_tree().current_scene.has_method("add_shake"):
		get_tree().current_scene.call("add_shake", 3.0)

func _die() -> void:
	if not alive:
		return
	alive = false
	
	var expl = ExplosionVFXClass.new()
	expl.set("color", body_color)
	expl.set("particle_count", 24 if ai_archetype == "boss" else 14)
	expl.global_position = global_position
	get_tree().current_scene.add_child(expl)
	
	if get_tree().current_scene.has_method("add_shake"):
		var shake_amt := 12.0 if ai_archetype == "boss" else 6.0
		get_tree().current_scene.call("add_shake", shake_amt)
		
	died.emit(self)
	queue_free()

func _clamp_to_arena() -> void:
	var half_size := 520.0
	if get_tree().current_scene != null and get_tree().current_scene.has_method("get_arena_half_size"):
		half_size = float(get_tree().current_scene.call("get_arena_half_size"))
	global_position.x = clamp(global_position.x, -half_size, half_size)
	global_position.y = clamp(global_position.y, -half_size, half_size)

func _draw() -> void:
	# Draw drop shadow underneath everything
	draw_rect(Rect2(Vector2(-32, -23), Vector2(64, 46)), Color(0, 0, 0, 0.18), true)
	
	# Draw tracks
	# Left track
	draw_rect(Rect2(Vector2(-30, -21), Vector2(60, 7)), Color(0.18, 0.18, 0.18), true)
	for i in range(-5, 6):
		draw_line(Vector2(i * 5.0, -21), Vector2(i * 5.0, -14), Color(0.1, 0.1, 0.1), 1.5)
	
	# Right track
	draw_rect(Rect2(Vector2(-30, 14), Vector2(60, 7)), Color(0.18, 0.18, 0.18), true)
	for i in range(-5, 6):
		draw_line(Vector2(i * 5.0, 14), Vector2(i * 5.0, 21), Color(0.1, 0.1, 0.1), 1.5)
	
	# Main body (Chassis)
	draw_rect(Rect2(Vector2(-26, -14), Vector2(52, 28)), body_color, true)
	draw_rect(Rect2(Vector2(-26, -14), Vector2(52, 28)), body_color.lightened(0.28), false, 2.0) # Glowing neon border
	draw_rect(Rect2(Vector2(14, -12), Vector2(10, 24)), body_color.lightened(0.15), true)
	
	# Draw Turret (rotate relative to chassis)
	draw_set_transform(Vector2.ZERO, turret_rotation - rotation, Vector2.ONE)
	
	# Barrel
	draw_rect(Rect2(Vector2(0, -4), Vector2(36, 8)), Color(0.25, 0.25, 0.25), true)
	draw_rect(Rect2(Vector2(0, -4), Vector2(36, 8)), body_color.lightened(0.25), false, 1.2) # Glowing barrel border
	draw_rect(Rect2(Vector2(32, -6), Vector2(6, 12)), body_color.darkened(0.2), true)
	
	# Turret Base (circle)
	draw_circle(Vector2.ZERO, 15.0, turret_color)
	draw_arc(Vector2.ZERO, 15.0, 0.0, TAU, 32, body_color.lightened(0.35), 2.0) # Glowing turret base border
	draw_circle(Vector2(-4, -4), 5.0, turret_color.darkened(0.35))
	draw_circle(Vector2.ZERO, 4.0, Color(1, 1, 1, 0.9)) # Neon energy core
	
	# Muzzle flash
	if muzzle_flash_timer > 0.0:
		draw_circle(Vector2(42, 0), 12.0, Color(1.0, 0.9, 0.2, 0.95))
		draw_circle(Vector2(45, 0), 6.0, Color(1.0, 1.0, 1.0, 0.95))
	
	# Reset transform
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	
	# Draw health and shield bars
	var hp_ratio: float = 0.0
	if max_hp > 0.0:
		hp_ratio = float(clamp(hp / max_hp, 0.0, 1.0))
	draw_rect(Rect2(Vector2(-30, -32), Vector2(60, 5)), Color(0.1, 0.1, 0.1, 0.65), true)
	draw_rect(Rect2(Vector2(-30, -32), Vector2(60.0 * hp_ratio, 5)), Color(0.2, 0.95, 0.35, 0.9), true)
	
	if shield_capacity > 0.0:
		var shield_ratio: float = float(clamp(shield / shield_capacity, 0.0, 1.0))
		draw_rect(Rect2(Vector2(-30, -25), Vector2(60, 4)), Color(0.1, 0.1, 0.1, 0.65), true)
		draw_rect(Rect2(Vector2(-30, -25), Vector2(60.0 * shield_ratio, 4)), Color(0.28, 0.72, 1.0, 0.95), true)

	# Shield Bubble VFX
	if shield > 0.0 and (shield_vfx_timer > 0.0 or hp_ratio < 0.3):
		var shield_alpha := 0.25
		if shield_vfx_timer > 0.0:
			shield_alpha = 0.5 * (shield_vfx_timer / 0.35)
		draw_circle(Vector2.ZERO, 46.0, Color(0.28, 0.72, 1.0, shield_alpha * 0.4))
		draw_arc(Vector2.ZERO, 46.0, 0.0, TAU, 32, Color(0.28, 0.72, 1.0, shield_alpha), 2.0)
