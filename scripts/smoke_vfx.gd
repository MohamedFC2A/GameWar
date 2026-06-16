extends Node2D


var color := Color(0.35, 0.35, 0.35)
var size := 5.0
var lifetime := 0.4
var age := 0.0
var velocity := Vector2.ZERO

func _ready() -> void:
	z_index = 20
	velocity = Vector2(randf_range(-15.0, 15.0), randf_range(-15.0, 15.0))

func _process(delta: float) -> void:
	age += delta
	if age >= lifetime:
		queue_free()
		return
	global_position += velocity * delta
	queue_redraw()

func _draw() -> void:
	var progress := age / lifetime
	var alpha := 0.35 * (1.0 - progress)
	var current_color := color
	current_color.a = alpha
	var current_size := size * (1.0 + progress * 0.8)
	draw_circle(Vector2.ZERO, current_size, current_color)
