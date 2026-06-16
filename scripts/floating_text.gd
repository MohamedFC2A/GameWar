extends Node2D


var text := ""
var color := Color.WHITE
var velocity := Vector2(0, -60.0)
var lifetime := 0.8
var age := 0.0
var label: Label

func _ready() -> void:
	z_index = 1000
	label = Label.new()
	label.text = text
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.add_theme_color_override("font_color", color)
	label.add_theme_font_size_override("font_size", 16)
	label.add_theme_color_override("font_outline_color", Color.BLACK)
	label.add_theme_constant_override("outline_size", 4)
	
	label.grow_horizontal = Control.GROW_DIRECTION_BOTH
	label.grow_vertical = Control.GROW_DIRECTION_BOTH
	label.position = Vector2(-100, -12)
	label.size = Vector2(200, 24)
	add_child(label)

func _process(delta: float) -> void:
	age += delta
	if age >= lifetime:
		queue_free()
		return
	position += velocity * delta
	var alpha := 1.0 - (age / lifetime)
	label.modulate.a = alpha
