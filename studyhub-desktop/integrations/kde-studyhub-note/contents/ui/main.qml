import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Layouts 1.15
import org.kde.plasma.plasmoid 2.0
import org.kde.plasma.core 2.0 as PlasmaCore

PlasmoidItem {
    id: root
    implicitWidth: 340
    implicitHeight: 300
    preferredRepresentation: fullRepresentation

    fullRepresentation: ColumnLayout {
        spacing: 0
        Rectangle {
            Layout.fillWidth: true
            Layout.fillHeight: true
            radius: 12
            color: "#fff8b8"
            border.color: "#d6c86a"
            border.width: 1

            ColumnLayout {
                anchors.fill: parent
                anchors.margins: 12
                spacing: 8
                RowLayout {
                    Layout.fillWidth: true
                    Label { text: "StudyHub · Nota rápida"; font.bold: true; color: "#3d3920"; Layout.fillWidth: true }
                    ToolButton { text: "×"; onClicked: root.expanded = false }
                }
                TextArea {
                    id: editor
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    wrapMode: TextEdit.Wrap
                    placeholderText: "Escreva uma anotação..."
                    color: "#292714"
                    background: Rectangle { color: "transparent" }
                }
                RowLayout {
                    Layout.fillWidth: true
                    Label { text: "Salva no StudyHub"; color: "#6a6438"; font.pixelSize: 11; Layout.fillWidth: true }
                    Button { text: "Abrir StudyHub"; onClicked: Qt.openUrlExternally("studyhub://quick-note") }
                }
            }
        }
    }
}
