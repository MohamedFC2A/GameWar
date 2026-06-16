extends Area2D
class_name TankProjectile

var ExplosionVFXClass = load("res://scripts/explosion_vfx.gd")
var SmokeVFXClass = load("res://scripts/smoke_vfx.gd")

var stats: Dictionary = {}
var owner_team: String = ""
var direction: Vector2 = Vector2.RIGHT
var speed := 800.0
var range := 900.0
var traveled := 0.0
var pierce_left := 0
var splash_radius := 0.0
var slow_multiplier := 0.85
var slow_duration := 1.0
var owner_ref: Node = null
var body_color: Color = Color.WHITE
var active := false
var smoke_spawn_timer := 0.0

func _ready() -> void:
	collision_layer = 2
	collision_mask = 1 | 4
	monitoring = true
	monitorable = true
	body_entered.connect(_on_body_entered)
	if not has_node("CollisionShape2D"):
		var shape := CollisionShape2D.new()
		var circle := CircleShape2D.new()
		circle.radius = 7.0
		shape.shape = circle
		add_child(shape)
	queue_redraw()

func configure(source_stats: Dictionary, team: String, fire_direction: Vector2, owner: Node, color: Color) -> void:
	stats = source_stats.duplicate(true)
	owner_team = team
	direction = fire_direction.normalized() if fire_direction.length() > 0.01 else Vector2.RIGHT
	speed = float(stats.get("projectile_speed", 800.0))
	range = float(stats.get("projectile_range", 900.0))
	traveled = 0.0
	pierce_left = int(stats.get("projectile_pierce", 0))
	splash_radius = float(stats.get("splash_radius", 0.0))
	slow_multiplier = float(stats.get("slow_multiplier", 0.85))
	slow_duration = float(stats.get("slow_duration", 1.0))
	owner_ref = owner
	body_color = color
	active = true
	rotation = direction.angle()
	queue_redraw()

func _physics_process(delta: float) -> void:
	if not active:
		return
	global_position += direction * speed * delta
	traveled += speed * delta
	z_index = int(global_position.y)
	
	smoke_spawn_timer += delta
	if smoke_spawn_timer >= 0.035:
		smoke_spawn_timer = 0.0
		_spawn_trail()
		
	if traveled >= range:
		queue_free()

func _spawn_trail() -> void:
	var parent_node = get_parent()
	if parent_node == null:
		return
	var smoke = SmokeVFXClass.new()
	smoke.set("color", body_color.lightened(0.25))
	smoke.set("size", 4.5)
	smoke.set("lifetime", 0.26)
	smoke.global_position = global_position - direction * 6.0
	parent_node.add_child(smoke)

func _on_body_entered(body: Node) -> void:
	if not active:
		return
	if body == owner_ref:
		return
	if body is TankEntity and body.team != owner_team:
		body.take_damage(float(stats.get("damage", 10.0)))
		if body.has_method("apply_slow") and stats.get("features", []).has("slow"):
			body.apply_slow(slow_multiplier, slow_duration)
		if splash_radius > 0.0:
			_explode()
		else:
			_spawn_hit_vfx()
		if pierce_left > 0:
			pierce_left -= 1
			return
		queue_free()
	elif (body.collision_layer & 4) != 0:
		if splash_radius > 0.0:
			_explode()
		else:
			_spawn_hit_vfx()
		queue_free()

func _spawn_hit_vfx() -> void:
	var parent_node = get_parent()
	if parent_node == null:
		return
	var expl = ExplosionVFXClass.new()
	expl.set("color", body_color)
	expl.set("particle_count", 8)
	expl.set("lifetime", 0.35)
	expl.global_position = global_position
	parent_node.add_child(expl)

func _explode() -> void:
	var parent_node = get_parent()
	if parent_node == null:
		return
	var expl = ExplosionVFXClass.new()
	expl.set("color", body_color)
	expl.set("particle_count", 18)
	expl.set("lifetime", 0.45)
	expl.global_position = global_position
	parent_node.add_child(expl)

	for tank in get_tree().get_nodes_in_group("tanks"):
		if tank == null or tank == owner_ref:
			continue
		if not (tank is TankEntity):
			continue
		if tank.team == owner_team:
			continue
		if tank.global_position.distance_to(global_position) <= splash_radius:
			tank.take_damage(float(stats.get("damage", 10.0)) * 0.65)

func _draw() -> void:
	draw_circle(Vector2.ZERO, 7.0, body_color)
	draw_circle(Vector2.ZERO, 3.0, Color(1, 1, 1, 0.55))
