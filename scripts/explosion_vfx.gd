extends Node2D


var color: Color = Color(1.0, 0.45, 0.1)
var particle_count := 16
var lifetime := 0.5
var age := 0.0
var particles: Array = []

func _ready() -> void:
	z_index = 500
	for i in range(particle_count):
		var angle := randf_range(0.0, TAU)
		var speed := randf_range(50.0, 180.0)
		particles.append({
			"pos": Vector2.ZERO,
			"vel": Vector2.RIGHT.rotated(angle) * speed,
			"radius": randf_range(3.0, 7.0),
			"type": "fire" if randf() > 0.3 else "smoke"
		})

func _process(delta: float) -> void:
	age += delta
	if age >= lifetime:
		queue_free()
		return
	
	for p in particles:
		p.pos += p.vel * delta
		p.vel *= 0.9
	queue_redraw()

func _draw() -> void:
	var progress := age / lifetime
	var alpha := 1.0 - progress
	
	for p in particles:
		var draw_color := color
		if p.type == "smoke":
			draw_color = Color(0.25, 0.25, 0.25)
		draw_color.a = alpha
		draw_circle(p.pos, p.radius * (1.0 - progress * 0.4), draw_color)
